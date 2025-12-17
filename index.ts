// import ollama from 'ollama'

import { ChatOllama } from "@langchain/ollama";

// const response = await ollama.chat({
//   model: "deepseek-r1",
//   messages: [{ role: 'user', content: '为什么天空是蓝色的?' }],
// })

// console.log(response.message.content)


const model = new ChatOllama({
  model: "qwen3-vl:8b", // Default value.
  baseUrl:"http://127.0.0.1:11434",
  temperature: 0.7, 
   numPredict: 1000,
   topP: 0.7,
   frequencyPenalty: 0,
   presencePenalty: 0,
});

const messages = [
  { role: "system", content: "You are a poetry expert" },
  { role: "user", content: "Write a haiku about spring" },
  { role: "assistant", content: "Cherry blossoms bloom..." },
];
// const result = await model.invoke(["human", "Hello, how are you?"]);

const result = await model.invoke(messages);

console.log(result);