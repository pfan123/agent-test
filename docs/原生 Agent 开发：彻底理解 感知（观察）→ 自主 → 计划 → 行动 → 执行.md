# 原生 Agent 开发：彻底理解 感知（观察）→ 自主 → 计划 → 行动 → 执行

> 直接喂给 AI 获取
> ✅ **5 步对应原生 Agent 完整版代码**  
> ✅ **可直接用于生产的极简 Agent 模板**

## 一、一句话总纲（必须背下来）

**原生 Agent = 能自主感知环境、自主制定计划、自主调用工具、自主执行闭环的 AI 系统**

它的核心工作流是标准 **5 步闭环**：

#### 感知（观察）→ 自主决策 → 规划步骤 → 采取行动 → 本地执行

---

## 二、逐步骤拆解（原生代码视角 + 通俗解释）

我会把每一步对应到**你刚才写的原生 loop 代码**，让你彻底落地。

---

## 1）感知 / 观察（Perceive/Observing）

### 是什么？

Agent **“看世界”**的过程：

- 用户输入了什么
- 历史消息有什么
- 工具返回了什么结果
- 当前状态走到哪一步

### 本质

**读取 state + 读取 messages**

### 原生代码对应

```javascript
const messages = [...历史对话, 用户问题];
```

Agent 通过 `messages` 感知**全部上下文环境**。

---

## 2）自主（Autonomy）

### 是什么？

**不需要人干预，AI 自己决定接下来做什么**：

- 要不要调用工具
- 调用哪个工具
- 还需不需要继续思考
- 什么时候结束

### 本质

**模型根据 system prompt + tools + 上下文，自由决策**

### 原生代码对应

```javascript
tool_choice: "auto"; // 让模型自主判断
```

```javascript
if (!aiMessage.tool_calls) {
  // 模型自主决定结束
}
```

---

## 3）计划（Planning）

### 是什么？

**Agent 把复杂任务拆成多步步骤**

例如：
`“北京天气+时间”`
→ 计划：

1. 调用 getWeather
2. 调用 getTime
3. 整理回答

### 本质

**模型内部推理：任务分几步？按什么顺序？**

### 原生代码对应

你看不到计划，但模型返回**一连串 tool_calls** 就是计划：

```javascript
tool_calls: [
  { name: "getWeather", params: { city: "北京" } },
  { name: "getTime", params: { location: "北京" } },
];
```

---

## 4）行动（Action）

### 是什么？

**模型输出具体指令：调用哪个工具、传什么参数**

它不执行，只发**行动指令**。

### 本质

**模型返回 tool_calls**

### 原生代码对应

```javascript
const toolCalls = aiMessage.tool_calls;
```

---

## 5）执行（Execution）

### 是什么？

**在你的系统里真正运行工具函数，调用接口、查询数据库、计算等**

### 本质

**本地执行函数，与模型无关**

### 原生代码对应

```javascript
const result = toolMap[name](args); // 真正执行
```

---

## 三、把 5 步合成一张图（Agent 灵魂流程图）

```
【1 感知】
读取 messages、用户问题、历史、工具结果
   ↓
【2 自主】
模型自主判断：是否需要工具？
   ↓
【3 计划】
模型拆解任务：先调A、再调B、再回答
   ↓
【4 行动】
模型返回 tool_calls（行动指令）
   ↓
【5 执行】
本地执行工具 → 拿到结果
   ↓
把结果放回 messages → 回到【1 感知】
（循环直到完成或达到最大步数）
```

---

## 四、用一段原生代码，对应 5 步（最清晰）

```javascript
async function agentLoop() {
  // ========== 1. 感知（观察环境）==========
  const messages = [{ role: "user", content: "北京天气+时间" }];

  for (let step = 0; step < 5; step++) {
    // ========== 2. 自主 + 3. 计划 ==========
    const aiMessage = await model.invoke({ messages, tools });

    // ========== 4. 行动（模型输出行动指令）==========
    const toolCalls = aiMessage.tool_calls;

    if (!toolCalls) {
      return; // 自主结束
    }

    // ========== 5. 执行（本地真正运行）==========
    for (const call of toolCalls) {
      const result = toolMap[call.name](call.args);
      messages.push({ role: "tool", content: result });
    }
  }
}
```

---

## 六、总结（最关键）

### **原生 Agent = 感知 → 自主 → 计划 → 行动 → 执行 → 循环闭环**

你只要按这个结构写代码，就是**标准原生智能体**。
所有框架（LangGraph、LangChain、AutoGPT）底层全是这个逻辑。
