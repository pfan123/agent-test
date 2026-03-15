import { debug } from "@utils/debug";
import { GraphNode } from "@langchain/langgraph";
import { ChatOllama } from "@langchain/ollama";
import { SystemMessage } from "@langchain/core/messages";
import { MessagesStateType, type ToolsByName } from "../types";

let toolsByName: ToolsByName = {};

const model = new ChatOllama({
  model: "qwen3-vl:8b",
  baseUrl: "http://127.0.0.1:11434",
  temperature: 0.7,
  numPredict: 1024,
  streaming: false,
  think: false,
});

export const llmCall: GraphNode<MessagesStateType> = async (
  state: MessagesStateType,
) => {
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
};
