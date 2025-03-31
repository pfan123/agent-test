import ollama from 'ollama'

const response = await ollama.chat({
  model: "deepseek-r1",
  messages: [{ role: 'user', content: '为什么天空是蓝色的?' }],
})

console.log(response.message.content)