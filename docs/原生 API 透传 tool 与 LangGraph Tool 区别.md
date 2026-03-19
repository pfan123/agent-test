# 原生 API 透传 tool 与 LangGraph Tool 区别

> 一句话核心区别
> **「原生API透传tool」= 只有大脑（决策），没有手脚（执行）**
> **LangGraph Tool = 大脑 + 手脚 + 自动流程（完整闭环）**

## 1. 先把两个东西拆到最本质

### ① 原生大模型 API + 透传 tool（你说的这种）

**它只干一件事：做决策，不干执行！**

- 你传：`messages + tools(说明书)`
- 模型回：**我决定调用哪个tool、传什么参数**
- **模型不会执行函数**
- **模型不会自动继续对话**
- 执行、下一步、循环、判断……**全都要你自己写代码**

👉 本质：**纯推理、纯决策**，是**最底层能力**

### ② LangGraph Tool（框架层）

**它干三件事：决策 + 自动执行 + 自动流转**

- 内置帮你封装好了：
  1. 把你的函数变成 tool 说明书
  2. 调用模型拿到决策
  3. **自动在本地执行真实函数**
  4. **自动把结果传回模型**
  5. **自动循环、多轮调用、多工具调用**

👉 本质：**完整工作流 = 决策 + 执行 + 循环**

---

## 2. 用一个流程秒懂差距（超级直观）

### 原生 API 透传 tool（手动版）

你要自己写代码做这 5 步：

1. 你构造请求 → 传给模型
2. 模型返回：`call tool getWeather(city="北京")`
3. **你写代码解析** → 发现要调用工具
4. **你写代码执行**本地 `getWeather("北京")`
5. **你把结果再拼回 messages** → 再发一次请求

**少一步都跑不起来。**

---

### LangGraph Tool（自动版）

你只需要：

1. 写一个本地函数，加个 `@tool` 装饰器
2. 丢给 LangGraph
3. 启动

剩下全部**自动完成**：

- 自动转 tool 说明书
- 自动调用模型
- 自动执行本地函数
- 自动把结果传回模型
- 自动多轮、自动循环、自动结束

**你不用管流程，只写业务函数。**

---

## 3. 最精准的对比表

| 维度     | 原生 API 透传 tool | LangGraph Tool         |
| -------- | ------------------ | ---------------------- |
| 角色     | 大模型推理层       | 智能体执行框架         |
| 功能     | 只做**决策**       | 决策 + 执行 + 流转     |
| 执行函数 | 你自己写           | 框架自动执行           |
| 多轮调用 | 你自己写循环       | 自动多轮               |
| 工具选择 | 模型决定           | 模型决定               |
| 状态管理 | 无，你自己维护     | 内置状态、记忆、图流程 |
| 复杂度   | 极高（全手写）     | 极低（开箱即用）       |

---

## 4. 最通俗比喻（一看就懂）

### 原生 API 透传 tool = **老板**

- 只说：**你去查天气**
- 不查、不动、不执行
- 你要自己去查、自己跑、自己回来汇报

### LangGraph Tool = **全能助理**

- 听到需求
- **自动判断要不要查**
- **自动去查**
- **自动回来告诉你结果**

---

## 5. 它们的关系（不是对立，是层级）

```
你的应用代码
  ↑
LangGraph / LangChain （框架层：执行、调度、循环）
  ↑
原生大模型 API （底层：推理、决策、tool 输出）
```

- **原生 tool 透传 = 地基**
- **LangGraph Tool = 盖好的房子**

---

## 6.示例

### 原生 API 透传 tool

```
import axios from 'axios';

// 1. 你本地真正能执行的工具函数
function getWeather(city) {
  return `${city}：晴天，25℃`;
}

// 2. 传给模型的【工具说明书】
const tools = [
  {
    type: "function",
    function: {
      name: "getWeather",
      description: "获取指定城市的天气",
      parameters: {
        type: "object",
        properties: {
          city: { type: "string" }
        },
        required: ["city"]
      }
    }
  }
];

// 3. 调用基模 API，透传 tool
async function run() {
  const response = await axios.post(
    "https://api.openai.com/v1/chat/completions",
    {
      model: "gpt-3.5-turbo",
      messages: [{ role: "user", content: "北京天气怎么样？" }],
      tools: tools,          // 透传工具
      tool_choice: "auto"    // 模型自由决策
    },
    {
      headers: {
        "Authorization": "Bearer YOUR_API_KEY",
        "Content-Type": "application/json"
      }
    }
  );

  // 4. 模型返回决策：告诉我要调用哪个 tool
  const msg = response.data.choices[0].message;
  const toolCall = msg.tool_calls[0];
  const funcName = toolCall.function.name;
  const args = JSON.parse(toolCall.function.arguments);

  // 5. 你本地执行工具
  if (funcName === "getWeather") {
    const result = getWeather(args.city);
    console.log("工具执行结果：", result);
  }
}

run();
```

### LangGraph Tool

```
import { ChatOpenAI } from "@langchain/openai";
import { tool } from "@langchain/core/tools";
import { StateGraph, START, END } from "@langchain/langgraph";
import { MessagesState, ToolNode } from "@langchain/langgraph";

// ==============================
// 1. 定义工具（你本地真正的函数）
// ==============================
const getWeather = tool(async ({ city }) => {
  return `${city}：晴天，25℃`;
}, {
  name: "getWeather",
  description: "获取指定城市的天气",
  schema: {
    type: "object",
    properties: { city: { type: "string" } },
    required: ["city"],
  },
});

// 工具节点：LangGraph 自动执行匹配的工具
const toolNode = new ToolNode([getWeather]);

// ==============================
// 2. LLM 调用节点
// ==============================
const model = new ChatOpenAI({
  model: "gpt-3.5-turbo",
  apiKey: "YOUR_API_KEY",
}).bindTools([getWeather]); // 绑定工具给模型

async function llmCall(state) {
  const result = await model.invoke(state.messages);
  return { messages: [result] };
}

// ==============================
// 3. 条件路由：是否调用工具
// ==============================
function shouldContinue(state) {
  const lastMsg = state.messages[state.messages.length - 1];
  if (lastMsg.tool_calls?.length) {
    return "toolNode"; // 有工具调用 → 进工具节点
  }
  return END; // 无调用 → 结束
}

// ==============================
// 4. 构建最新版 LangGraph 流
// ==============================
const graph = new StateGraph(MessagesState)
  .addNode("llmCall", llmCall)
  .addNode("toolNode", toolNode)
  .addEdge(START, "llmCall")
  .addConditionalEdges("llmCall", shouldContinue)
  .addEdge("toolNode", "llmCall")
  .compile();

// ==============================
// 5. 运行
// ==============================
async function run() {
  const res = await graph.invoke({
    messages: [{ role: "user", content: "北京天气怎么样？" }],
  });
  console.log("最终回答：", res.messages.at(-1).content);
}

run();
```

## 7. 最终总结（你记这个就够）

- **原生API透传tool**：
  模型只输出**要不要调用工具**，
  执行、循环、流程全靠你自己写。

- **LangGraph Tool**：
  帮你把**决策 → 执行 → 回传 → 多轮**全部自动化，
  你只写函数，不写流程。
