import { tool } from "@langchain/core/tools";
import { StateGraph, START, END } from "@langchain/langgraph";
import { AIMessage } from "@langchain/core/messages";
import { spawn, ChildProcess } from "child_process";
import * as z from "zod";
import { debug } from "@utils/debug";
import { error } from "@utils/error";
import { MessagesState } from "./fishing-agent-state";
import { mcpToolNode } from "./nodes/mcp-tool-node";
import { llmCall } from "./nodes/llm-call";
import { MessagesStateType, type ToolsByName } from "./types";

let geocodingProcess: ChildProcess;
let weatherProcess: ChildProcess;
let requestId = 0;
const pendingRequests = new Map<
  number,
  { resolve: Function; reject: Function }
>();

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

let toolsByName: ToolsByName = {};

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
    .addNode("toolNode", mcpToolNode)
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
