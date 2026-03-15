import { debug } from "@utils/debug";
import { error } from "@utils/error";
import { AIMessage, ToolMessage } from "@langchain/core/messages";
import { MessagesStateType, type ToolsByName } from "../types";

let toolsByName: ToolsByName = {};

export const mcpToolNode = async (state: MessagesStateType) => {
  debug("=== mcpToolNode 开始 ===");

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
};
