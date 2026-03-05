import OpenAI from "openai";

// 从环境变量获取 API Key
const apiKey = process.env.OPENAI_API_KEY;

if (!apiKey) {
  throw new Error("环境变量 OPENAI_API_KEY 未设置");
}

// OpenAI API 兼容 https://docs.bigmodel.cn/cn/guide/develop/openai/introduction
const client = new OpenAI({
  apiKey,
  baseURL:
    process.env.OPENAI_BASE_URL || "https://open.bigmodel.cn/api/paas/v4/",
});

const tools = [
  {
    type: "function",
    name: "get_weather",
    description: "Get current temperature for a given location.",
    parameters: {
      type: "object",
      properties: {
        location: {
          type: "string",
          description: "City and country e.g. Bogotá, Colombia",
        },
      },
      required: ["location"],
      additionalProperties: false,
    },
    strict: true,
  },
  { type: "web_search", name: "web_search", web_search: { enable: true } },
];

const response = await client.chat.completions.create({
  model: "glm-5",
  // tools,
  messages: [
    {
      role: "system",
      content: "你是一个有用的AI助手。",
    },
    {
      role: "user",
      content: "今天深圳天气？",
    },
  ],
  top_p: 0.7,
  temperature: 0.9,
});

// console.log(response.choices[0].message.content);
console.log(response);
