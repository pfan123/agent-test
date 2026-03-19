# 原生 AI Agent 循环（Loop）实现完全指南

## 一、先搞懂：Agent Loop 到底是什么？

### 1.1 定义

Agent 循环 = **AI 自主思考与工具调用的闭环**  
流程：  
`用户提问 → AI 判断是否需要工具 → 执行工具 → 将结果返回 AI → AI 继续判断 → 完成回答`

### 1.2 核心目标

- 让模型**自由决策**是否调用工具
- 让工具**自动执行**
- 让流程**自动循环**
- 让系统**安全终止**（不会死循环）

---

## 二、最关键：Agent 循环怎么设计才合理？

### 2.1 错误设计 ❌

- `while(true)` 无限制循环
- 没有最大步数
- 可能无限调用工具
- 生产环境绝对不可用

### 2.2 正确设计 ✅（工业级标准）

**双条件终止机制：满足任意一个就停止**

1. **模型主动结束**  
   不返回 `tool_calls` → 任务完成
2. **达到最大步数**  
   `step >= maxSteps` → 强制终止（安全锁）

### 2.3 一句话总结

**Agent Loop = 限制步数的循环 + 模型自主决策结束**

---

## 三、完整执行流程（结构化图解）

```
开始
  ↓
【第 1 步】调用模型
  ↓
判断：有没有 tool_calls？
  ├── 无 → 结束（回答完成）
  └── 有 → 执行所有工具
        ↓
将工具结果 push 进 messages
  ↓
【第 2 步】再次调用模型
  ↓
……（自动重复）
  ↓
直到：无 tool_calls 或 达到 maxSteps
```

---

## 四、为什么必须限制 maxSteps？

- 防止模型**无限调用工具**
- 防止**死循环思考**
- 控制 **token 成本**
- 控制 **响应时间**
- 保证系统稳定性

### 通用推荐值

- 简单任务：**2~3**
- 标准任务：**5**（最常用）
- 复杂任务：**6~8**
- 不建议超过 **10**

---

## 五、原生 API 实现 Agent Loop（最终可运行代码）

Node.js + 无框架 + 纯原生 + 生产可用

```javascript
import axios from "axios";

// ==========================================
// 1. 本地真实工具（真正执行的函数）
// ==========================================
const toolsMap = {
  getWeather: ({ city }) => `${city}：晴天，24℃`,
  getTime: ({ location }) => `${location} 当前时间：14:30`,
};

// ==========================================
// 2. 工具说明书（传给 AI 的描述）
// ==========================================
const tools = [
  {
    type: "function",
    function: {
      name: "getWeather",
      description: "获取城市天气",
      parameters: {
        type: "object",
        properties: { city: { type: "string" } },
        required: ["city"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getTime",
      description: "获取地点当前时间",
      parameters: {
        type: "object",
        properties: { location: { type: "string" } },
        required: ["location"],
      },
    },
  },
];

// ==========================================
// 3. 核心：可靠 Agent Loop（双条件终止）
// ==========================================
async function runAgent(userQuery, maxSteps = 5) {
  const messages = [{ role: "user", content: userQuery }];

  // 🔥 安全循环：限制最大步数
  for (let step = 0; step < maxSteps; step++) {
    console.log(`\n=== 执行步骤 ${step + 1}/${maxSteps} ==`);

    // --------------------------
    // 调用大模型基模 API
    // --------------------------
    const res = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-3.5-turbo",
        messages,
        tools,
        tool_choice: "auto",
      },
      {
        headers: {
          Authorization: "Bearer YOUR_API_KEY",
          "Content-Type": "application/json",
        },
      },
    );

    const aiMessage = res.data.choices[0].message;
    messages.push(aiMessage);

    // --------------------------
    // 终止条件 1：模型无工具调用 → 正常结束
    // --------------------------
    if (!aiMessage.tool_calls) {
      console.log("\n✅ 任务完成：", aiMessage.content);
      return messages;
    }

    // --------------------------
    // 执行所有工具调用
    // --------------------------
    for (const call of aiMessage.tool_calls) {
      const func = toolsMap[call.function.name];
      const args = JSON.parse(call.function.arguments);
      const result = func(args);

      console.log("🔧 执行工具：", call.function.name, result);

      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: result,
      });
    }

    // --------------------------
    // 终止条件 2：达到 maxSteps → 强制结束（for 循环自动控制）
    // --------------------------
  }

  console.log("\n⚠️ 已达最大步骤，强制终止");
  return messages;
}

// ==========================================
// 运行
// ==========================================
runAgent("北京天气和时间是多少？", 5);
```

---

## 六、核心知识点结构化总结（最重要）

### 6.1 循环结构

- 使用 `for` 循环，不用 `while(true)`
- 用 `maxSteps` 做安全锁

### 6.2 终止规则（必须背）

**满足任一条件即停止：**

1. **模型不返回 tool_calls**
2. **达到 maxSteps**

### 6.3 消息机制（灵魂）

- `messages` 数组必须**持续追加**
- 工具返回结果必须以 `role: "tool"` 格式 push
- 模型才能基于历史继续思考

### 6.4 工具执行规则

- 必须**等待所有 tool 执行完**再进入下一轮
- 支持**批量工具调用**（多 tool 并行/串行）

---

## 七、最精简记忆版

### Agent Loop =

**for(step < maxSteps) + 模型 tool_call 判断 + messages 自动追加 + 工具本地执行**

### 终止规则 =

**无工具调用 OR 达到最大步数**
