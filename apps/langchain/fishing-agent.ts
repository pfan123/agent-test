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

const DEBUG = true;

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

let geocodingProcess: ChildProcess;
let weatherProcess: ChildProcess;
let requestId = 0;
const pendingRequests = new Map<
  number,
  { resolve: Function; reject: Function }
>();

function debug(...args: any[]) {
  if (DEBUG) {
    console.log("[DEBUG]", new Date().toISOString(), ...args);
  }
}

function error(...args: any[]) {
  console.error("[ERROR]", new Date().toISOString(), ...args);
}

function startMcpServer(
  name: string,
  command: string[],
  readyMsg: string,
): Promise<ChildProcess> {
  return new Promise((resolve, reject) => {
    debug(`启动 ${name}...`);

    const process = spawn(command[0], command.slice(1), {
      stdio: ["pipe", "pipe", "pipe"],
    });

    let buffer = "";
    let stderrBuffer = "";

    process.stdout?.on("data", (data) => {
      const text = data.toString();
      // 完整输出 stdout
      console.log(`[${name} stdout]`, text);

      buffer += text;
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.trim().startsWith("{")) {
          try {
            const response = JSON.parse(line);
            // 完整输出 JSON 响应
            debug(`${name} 收到响应:`, JSON.stringify(response, null, 2));
            if (response.id !== undefined && pendingRequests.has(response.id)) {
              const { resolve } = pendingRequests.get(response.id)!;
              pendingRequests.delete(response.id);
              resolve(response);
            }
          } catch (e) {
            error(`${name} JSON 解析错误:`, e);
          }
        }
      }
    });

    process.stderr?.on("data", (data) => {
      const msg = data.toString();
      // 完整输出 stderr
      console.log(`[${name} stderr]`, msg);
      stderrBuffer += msg;

      if (msg.includes(readyMsg)) {
        console.log(`[MCP] ${name} 已启动`);
        resolve(process);
      }
    });

    process.on("error", (e) => {
      error(`${name} 进程错误:`, e);
      reject(e);
    });

    process.on("exit", (code) => {
      error(`${name} 进程退出, code:`, code);
      debug(`${name} stderr buffer:`, stderrBuffer);
    });

    setTimeout(() => reject(new Error(`${name} 启动超时`)), 10000);
  });
}

function callMcpTool(
  process: ChildProcess,
  toolName: string,
  args: Record<string, unknown>,
): Promise<any> {
  debug(`调用 MCP 工具: ${toolName}`, args);

  return new Promise((resolve, reject) => {
    const id = ++requestId;
    pendingRequests.set(id, { resolve, reject });

    const request = JSON.stringify({
      jsonrpc: "2.0",
      id,
      method: "tools/call",
      params: { name: toolName, arguments: args },
    });

    // 完整输出发送的请求
    console.log(`[MCP Request] ${toolName}:`, request);
    process.stdin?.write(request + "\n");

    setTimeout(() => {
      if (pendingRequests.has(id)) {
        error(`MCP 请求超时: ${toolName}`, args);
        pendingRequests.delete(id);
        reject(new Error("MCP 请求超时"));
      }
    }, 30000);
  });
}

async function getMcpTools(process: ChildProcess, serverName: string) {
  debug(`获取 ${serverName} 工具列表...`);

  const id = ++requestId;

  return new Promise<any[]>((resolve, reject) => {
    pendingRequests.set(id, { resolve, reject });

    const request = JSON.stringify({
      jsonrpc: "2.0",
      id,
      method: "tools/list",
      params: {},
    });

    debug(`发送 tools/list 请求`);
    process.stdin?.write(request + "\n");

    setTimeout(() => {
      if (pendingRequests.has(id)) {
        error(`MCP tools/list 超时: ${serverName}`);
        pendingRequests.delete(id);
        reject(new Error("MCP tools/list 超时"));
      }
    }, 30000);
  }).then((response) => {
    console.log(`[${serverName}] 工具列表:`, JSON.stringify(response, null, 2));
    return response.result?.tools || [];
  });
}

let toolsByName: Record<string, any>;

async function llmCall(state: MessagesStateType) {
  debug("=== llmCall 开始 ===");
  debug("消息数量:", state.messages.length);

  const tools = Object.values(toolsByName);
  debug("可用工具:", tools.map((t: any) => t.name).join(", "));

  const modelWithTools = model.bindTools(tools);

  const result = await modelWithTools.invoke([
    new SystemMessage(
      "你是一个钓鱼助手。当用户询问某个地点是否适合钓鱼时，你需要按以下步骤执行：\n" +
        "1. 首先调用 geocode 工具获取城市的经纬度坐标\n" +
        "2. 然后调用 get_weather_for_fishing 工具获取天气信息（传入 location, latitude 和 longitude 参数）\n" +
        "3. 获取天气后，评估钓鱼指数分数，并直接返回钓鱼建议以及出钓渔获预测，不要再调用任何工具\n" +
        "重要：获取到天气数据后必须立即给出最终答案，不要再次调用工具！",
    ),
    ...state.messages,
  ]);

  debug("LLM 返回, tool_calls:", result.tool_calls?.length || 0);
  debug("LLM content:", ((result.content as string) || "").substring(0, 200));

  return { messages: [result] };
}

async function toolNode(state: MessagesStateType) {
  debug("=== toolNode 开始 ===");

  const lastMessage = state.messages.at(-1);

  if (lastMessage == null || !AIMessage.isInstance(lastMessage)) {
    debug("非 AI 消息，跳过");
    return { messages: [] };
  }

  debug("工具调用数量:", lastMessage.tool_calls?.length || 0);

  const result: ToolMessage[] = [];
  for (const toolCall of lastMessage.tool_calls ?? []) {
    debug("执行工具:", toolCall.name, toolCall.args);

    const tool = toolsByName[toolCall.name as keyof typeof toolsByName];
    if (tool) {
      try {
        const observation = await tool.invoke(toolCall);
        debug("工具返回:", (observation.content as string)?.substring(0, 200));
        result.push(observation);
      } catch (e) {
        error("工具执行错误:", e);
        throw e;
      }
    } else {
      error("未找到工具:", toolCall.name);
    }
  }

  return { messages: result };
}

async function shouldContinue(state: MessagesStateType) {
  const lastMessage = state.messages.at(-1);

  if (!lastMessage || !AIMessage.isInstance(lastMessage)) {
    debug("shouldContinue: 结束 (非 AI 消息)");
    return END;
  }

  if (lastMessage.tool_calls?.length) {
    debug("shouldContinue: 继续 (有工具调用)");
    return "toolNode";
  }

  debug("shouldContinue: 结束 (无工具调用)");
  return END;
}

async function main() {
  console.log("正在启动 MCP 服务...");

  try {
    geocodingProcess = await startMcpServer(
      "Geocoding",
      ["pnpm", "--dir", "../../packages/mcp-geocoding-server", "start"],
      "MCP Geocoding Server 已启动",
    );

    weatherProcess = await startMcpServer(
      "Weather",
      ["pnpm", "--dir", "../../packages/mcp-weather-server", "start"],
      "MCP Weather Server 已启动",
    );

    console.log(" MCP 服务启动成功！\n");

    const geocodingTools = await getMcpTools(geocodingProcess, "Geocoding");
    const weatherTools = await getMcpTools(weatherProcess, "Weather");

    console.log(
      "[MCP] 可用工具:",
      [...geocodingTools, ...weatherTools].map((t: any) => t.name).join(", "),
      "\n",
    );

    toolsByName = {};

    for (const t of geocodingTools) {
      toolsByName[t.name] = tool(
        async (params: Record<string, unknown>) => {
          debug(`执行 geocode 工具, 参数:`, params);
          const result = await callMcpTool(geocodingProcess, t.name, params);
          debug(`geocode 返回:`, JSON.stringify(result).substring(0, 200));

          if (result.error) {
            error("MCP 错误:", result.error);
            throw new Error(result.error.message || "MCP 调用失败");
          }

          if (!result.result?.content?.[0]?.text) {
            error("MCP 返回格式错误:", result);
            throw new Error("MCP 返回格式错误: " + JSON.stringify(result));
          }
          return result.result.content[0].text;
        },
        {
          name: t.name,
          description: t.description || "",
          schema: z.object({
            location: z.string().describe("城市或地区名称"),
          }),
        },
      );
    }

    for (const t of weatherTools) {
      toolsByName[t.name] = tool(
        async (params: Record<string, unknown>) => {
          debug(`执行 weather 工具, 参数:`, params);
          const result = await callMcpTool(weatherProcess, t.name, params);
          debug(`weather 返回:`, JSON.stringify(result).substring(0, 200));

          if (result.error) {
            error("MCP 错误:", result.error);
            throw new Error(result.error.message || "MCP 调用失败");
          }

          if (!result.result?.content?.[0]?.text) {
            error("MCP 返回格式错误:", result);
            throw new Error("MCP 返回格式错误: " + JSON.stringify(result));
          }
          return result.result.content[0].text;
        },
        {
          name: t.name,
          description: t.description || "",
          schema: z.object({
            location: z.string().optional(),
            latitude: z.number().optional(),
            longitude: z.number().optional(),
          }),
        },
      );
    }
  } catch (error) {
    console.error("MCP 启动失败:", error);
    process.exit(1);
  }

  console.log("🎣 钓鱼 Agent (双 MCP: Geocoding + Weather)");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

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

  geocodingProcess.kill();
  weatherProcess.kill();
  process.exit(0);
}

main().catch(console.error);
