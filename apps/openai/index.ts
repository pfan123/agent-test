import OpenAI from "openai";

// OpenAI API 兼容 https://docs.bigmodel.cn/cn/guide/develop/openai/introduction
const client = new OpenAI({
  apiKey: "6d935f7d9daf4de6af6321ccf114ec21.pVttR5u0ulg63yTP",
  baseURL: "https://open.bigmodel.cn/api/paas/v4/",
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
  tools,
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
