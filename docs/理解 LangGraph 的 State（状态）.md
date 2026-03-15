# 理解 LangGraph 的 State（状态）

## 概念理解

在传统的程序里，数据是通过函数参数 A(data) -> B(data) 这样点对点传递的；但在 LangGraph 中，数据是全局流转的。
以下是理解 State 传输的 3 个核心规则：

1. “读-改-回写”模型
   每个节点（Node）执行时，LangGraph 会经历三个动作：

- 读（Read）：把当前 `Annotation` 上所有的内容（State）打包发给节点函数。
- 改（Modify）：节点函数内部处理逻辑，产生增量数据。
- 回写（Write）：节点返回（Return）一个对象，LangGraph 把这个对象合进 `Annotation` 。

注意： 节点不需要返回整个 State，只需要返回它改变了的那部分。2. Reducer：决定“怎么写”
这是传输中最关键的逻辑。当节点回写数据时，Annotation 定义的 Reducer 决定了合并方式：

- 覆盖（Replace）：如果字段没写 Reducer，新值直接踢掉旧值（适用于 current_user、status）。
- 追加（Append）：如果 Reducer 是 concat，新值会排在旧值后面（适用于 messages、logs）。

3. 传输的实例流程
   假设我们的 State 有两个字段：count (累加) 和 folder (覆盖)。

```
// 1. 初始状态 (START)// State: { count: 0, folder: "root" }
// 2. 节点 A 执行const nodeA = async (state: typeof MyState.State) => {
  // 节点 A 读到了 { count: 0, folder: "root" }
  return { count: 1, folder: "src" };
};
// 3. 传输并合并 (Middleware)// LangGraph 看到返回了 count: 1，根据 Reducer 做加法：0 + 1 = 1// 看到返回了 folder: "src"，直接覆盖旧值。// 新 State: { count: 1, folder: "src" }
// 4. 节点 B 执行const nodeB = async (state: typeof MyState.State) => {
  // 节点 B 读到了更新后的 { count: 1, folder: "src" }
  return { count: 5 };
};
// 5. 最终 State// { count: 6, folder: "src" }
```

4. 为什么这样设计？

- 断点续传（Persistence）：因为 State 是独立于节点的。如果程序在节点 B 崩溃了，LangGraph 只需要拿着那一刻的 State 快照，就能重新启动节点 B，而不需要从头运行。
- 并行安全：如果 A 和 B 同时运行并返回数据，LangGraph 会按顺序执行它们的 Reducer，确保 `Annotation` 上的数据不会因为竞争而错乱。

## “多轮 AI 调研助手” 示例

“多轮 AI 调研助手”，这个助手会：

1.  搜索信息（追加到列表）。
2.  计数已执行的步数（累加）。
3.  判断是否足够（条件分叉）。
4.  保存最终报告（直接覆盖）。

5.  定义复杂状态 (State & Annotation)
    这是 `Annotation` 的规格。注意我们如何利用 reducer 处理不同类型的数据流。

```
import { Annotation } from "@langchain/langgraph";
// 定义单条搜索结果的结构interface SearchResult {
  source: string;
  content: string;
}
const ResearchState = Annotation.Root({
  // 1. 搜索结果池：使用 reducer 实现“追加”而非“覆盖”
  results: Annotation<SearchResult[]>({
    reducer: (current, next) => current.concat(next),
    default: () => [],
  }),

  // 2. 步数计数：使用 reducer 实现“自动累加”
  steps: Annotation<number>({
    reducer: (current, next) => current + next,
    default: () => 0,
  }),

  // 3. 最终报告：不写 reducer，默认行为是“直接覆盖”
  finalReport: Annotation<string | null>({
    default: () => null,
  }),

  // 4. 话题：用户输入，保持不变
  topic: Annotation<string>(),
});
```

2. 编写功能节点 (Nodes)
   每个节点只负责自己那一小块逻辑，并返回增量数据。

```
// 节点 A: 模拟搜索引擎const webSearchNode = async (state: typeof ResearchState.State) => {
  console.log(`--- 正在为话题 [${state.topic}] 进行第 ${state.steps + 1} 次搜索 ---`);

  // 模拟搜索结果
  const newResult: SearchResult = {
    source: "Google",
    content: `这是关于 ${state.topic} 的相关信息片段...`
  };

  // 注意：只需返回变化的部分，LangGraph 会根据 Annotation 逻辑处理
  return {
    results: [newResult], // 这里的数组会被 concat 到 state.results
    steps: 1              // 这里的 1 会被加到 state.steps
  };
};
// 节点 B: 总结报告const summarizeNode = async (state: typeof ResearchState.State) => {
  console.log("--- 正在生成最终报告 ---");
  const report = `汇总了 ${state.results.length} 条信息：${state.results.map(r => r.content).join("\n")}`;
  return { finalReport: report };
};
```

3. 构建图逻辑 (Edges)
   这里展示了如何利用 State 中的数据做路由决策。

```
import { StateGraph, START, END } from "@langchain/langgraph";
const workflow = new StateGraph(ResearchState)
  .addNode("search", webSearchNode)
  .addNode("summarize", summarizeNode)

  // 逻辑流转
  .addEdge(START, "search")

  // 条件边：根据 state 中的 steps 决定去向
  .addConditionalEdges(
    "search",
    (state) => {
      // 这里的 state 是经过 Reducer 合并后的最新状态
      if (state.steps >= 3) {
        return "complete"; // 搜够 3 次了，去总结
      }
      return "continue";   // 还没搜够，回去接着搜
    },
    {
      complete: "summarize",
      continue: "search", // 形成一个循环 (Loop)
    }
  )
  .addEdge("summarize", END);
const app = workflow.compile();
```

---

深入理解这个“复杂传输”过程：

1.  State 的自动合并：
    在 webSearchNode 里，你返回的是 { steps: 1 }。由于我们在 Annotation 里定义了 steps 的 reducer 是 (c, n) => c + n，所以每经过一次这个节点，state.steps 就会自动加 1。你不需要写 steps: state.steps + 1，这避免了并发冲突。
2.  循环中的状态持久化：
    在循环（search -> search）中，results 列表会不断变长。因为它是 concat 逻辑，旧的搜索结果永远不会被丢弃。
3.  路由决策基于最新状态：
    addConditionalEdges 里的判断函数拿到的 state 是最新的。它能准确知道现在是第几次循环，从而决定是继续“套娃”还是结束任务。
4.  TS 类型保护：
    如果你在 summarizeNode 里尝试返回 { steps: "one" }（字符串），TypeScript 会立即报错，因为 ResearchState 规定了 steps 必须是 number。

核心总结

- Annotation 定义了数据的存储策略（加法、合并还是替换）。
- Nodes 产生原材料（只给差异数据）。
- Graph 负责搬运和处理（根据策略把原材料合进 State，再传给下一站）。
