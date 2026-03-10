import { ChatOllama } from "@langchain/ollama";
import { tool } from "@langchain/core/tools";
import { StateGraph, START, END, Annotation } from "@langchain/langgraph";
import {
  AIMessage,
  ToolMessage,
  SystemMessage,
} from "@langchain/core/messages";
import { spawn, ChildProcess } from "child_process";
import * as z from "zod";

const model = new ChatOllama({
  model: "qwen3-vl:8b",
  baseUrl: "http://127.0.0.1:11434",
  temperature: 0.7,
  numPredict: 1024,
  streaming: false,
  think: false,
});

const MessagesState = Annotation.Root({
  messages: Annotation({
    reducer: (a, b) => [...a, ...b],
    default: () => [],
  }),
});

type MessagesStateType = typeof MessagesState.State;

let mcpProcess: ChildProcess;
let requestId = 0;
const pendingRequests = new Map<
  number,
  { resolve: Function; reject: Function }
>();

function startMcpServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    mcpProcess = spawn(
      "pnpm",
      ["--dir", "../../packages/mcp-weather-server", "start"],
      {
        stdio: ["pipe", "pipe", "pipe"],
      },
    );

    let buffer = "";

    mcpProcess.stdout?.on("data", (data) => {
      buffer += data.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.trim().startsWith("{")) {
          try {
            const response = JSON.parse(line);
            if (response.id !== undefined && pendingRequests.has(response.id)) {
              const { resolve } = pendingRequests.get(response.id)!;
              pendingRequests.delete(response.id);
              resolve(response);
            }
          } catch {}
        }
      }
    });

    mcpProcess.stderr?.on("data", (data) => {
      const msg = data.toString();
      if (msg.includes("MCP Weather Server 已启动")) {
        resolve();
      }
    });

    mcpProcess.on("error", reject);

    setTimeout(() => reject(new Error("MCP 启动超时")), 10000);
  });
}

function callMcpTool(
  toolName: string,
  args: Record<string, unknown>,
): Promise<any> {
  return new Promise((resolve, reject) => {
    const id = ++requestId;
    pendingRequests.set(id, { resolve, reject });

    const request = JSON.stringify({
      jsonrpc: "2.0",
      id,
      method: "tools/call",
      params: { name: toolName, arguments: args },
    });

    mcpProcess.stdin?.write(request + "\n");

    setTimeout(() => {
      if (pendingRequests.has(id)) {
        pendingRequests.delete(id);
        reject(new Error("MCP 请求超时"));
      }
    }, 30000);
  });
}

async function getMcpTools() {
  const id = ++requestId;

  return new Promise<any[]>((resolve, reject) => {
    pendingRequests.set(id, { resolve, reject });

    const request = JSON.stringify({
      jsonrpc: "2.0",
      id,
      method: "tools/list",
      params: {},
    });

    mcpProcess.stdin?.write(request + "\n");

    setTimeout(() => {
      if (pendingRequests.has(id)) {
        pendingRequests.delete(id);
        reject(new Error("MCP 请求超时"));
      }
    }, 30000);
  }).then((response) => response.result?.tools || []);
}

let toolsByName: Record<string, any>;

async function llmCall(state: MessagesStateType) {
  const tools = Object.values(toolsByName);
  const modelWithTools = model.bindTools(tools);

  const result = await modelWithTools.invoke([
    new SystemMessage(
      "你是一个钓鱼助手。当用户询问某个地点是否适合钓鱼时，你必须调用 get_weather_for_fishing 工具来获取当前天气信息。\n" +
        "获取天气信息后，结合数据给出钓鱼建议。",
    ),
    ...state.messages,
  ]);

  return { messages: [result] };
}

async function toolNode(state: MessagesStateType) {
  const lastMessage = state.messages.at(-1);

  if (lastMessage == null || !AIMessage.isInstance(lastMessage)) {
    return { messages: [] };
  }

  const result: ToolMessage[] = [];
  for (const toolCall of lastMessage.tool_calls ?? []) {
    const tool = toolsByName[toolCall.name as keyof typeof toolsByName];
    if (tool) {
      const observation = await tool.invoke(toolCall);
      result.push(observation);
    }
  }

  return { messages: result };
}

async function shouldContinue(state: MessagesStateType) {
  const lastMessage = state.messages.at(-1);

  if (!lastMessage || !AIMessage.isInstance(lastMessage)) {
    return END;
  }

  if (lastMessage.tool_calls?.length) {
    return "toolNode";
  }

  return END;
}

async function main() {
  console.log("正在启动 MCP Weather Server...");

  try {
    await startMcpServer();
    console.log("MCP 连接成功！\n");

    const mcpTools = await getMcpTools();
    console.log("可用工具:", mcpTools.map((t: any) => t.name).join(", "), "\n");

    toolsByName = {};
    for (const t of mcpTools) {
      toolsByName[t.name] = tool(
        async (params: Record<string, unknown>) => {
          const result = await callMcpTool(t.name, params);
          return result.result.content[0].text;
        },
        {
          name: t.name,
          description: t.description || "",
          schema: z.object({
            location: z.string().describe("城市名称，例如：深圳、北京、上海"),
          }),
        },
      );
    }
  } catch (error) {
    console.error("MCP 连接失败:", error);
    process.exit(1);
  }

  console.log("🎣 钓鱼 Agent (MCP + Open-Meteo)");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  const location = process.argv[2] || "深圳";
  const query = `${location}今天适合钓鱼吗？`;

  console.log(`用户问题: ${query}\n`);

  const agent = new StateGraph(MessagesState)
    .addNode("llmCall", llmCall)
    .addNode("toolNode", toolNode)
    .addEdge(START, "llmCall")
    .addConditionalEdges("llmCall", shouldContinue, ["toolNode", END])
    .addEdge("toolNode", "llmCall")
    .compile();

  agent.name = "Fishing Agent";

  const result = await agent.invoke({
    messages: [query],
  });

  console.log("=== 回答 ===");
  const lastMessage = result.messages[result.messages.length - 1];
  if (lastMessage?.type === "ai") {
    console.log(lastMessage.content);
  }

  mcpProcess.kill();
  process.exit(0);
}

main().catch(console.error);
