# 理解 LangGraph 中 Node 与 Edge

## LangGraph 图结构

LangGraph 强制要求“先定义节点，再定义边”，背后的逻辑其实借鉴了工业流水线和电路设计的思想：

1. 声明式编程：先有“零件”，后有“组装”
   LangGraph 采用的是声明式（Declarative）风格。

- Node（节点） 是你的功能组件（比如：调用 LLM、搜索工具、数据库读写）。
- Edge（边） 是这些组件之间的控制流。
  如果你还没定义有哪些工位（Node），系统就无法验证你的传送带（Edge）指向的地方是否存在。这就像写代码时，你必须先定义函数，才能在主逻辑里调用它。

2. 解耦：逻辑与流向分离
   这种写法将“做什么”和“怎么走”完全解耦：

- Node 关注局部： 编写 Node 函数时，你只需要关心：“给我一个 State，我该如何处理它？”。
- Edge 关注全局： 编写 Edge 时，你站在上帝视角指挥：“A 做完了给 B，B 报错了回 A”。
- 好处： 以后你想改变执行顺序（比如在 A 和 B 之间插一个审核节点），你只需要改动 add_edge 的几行代码，而不需要去动 Node 内部的业务逻辑。

3. 图的合法性校验 (Compilation)
   当你调用 .compile() 时，LangGraph 会像编译器一样扫描你的“配置清单”：

- 它会检查：你连向 node_B 的边，是否真的有一个叫 node_B 的节点存在？
- 如果有节点没连线，或者有边连向了虚无，它能在程序运行前就报错。
  如果不先写 Node，这个校验逻辑就无从谈起。

4. 状态机 (State Machine) 的严谨性
   LangGraph 的核心是一个状态机。

- Nodes 定义了状态转换的候选集合。
- Edges 定义了状态转换的允许路径。
  先明确“状态池”，再规定“转换路径”，是构建稳定智能体（Agent）最标准的方式，能有效防止 AI 在复杂的循环（Loop）中跑丢。

## 实例理解

为了让你秒懂，我们看一个最经典的实例：“翻译助手”。
逻辑是：用户输入中文 -> 节点 A 翻译成英文 -> 边判断（如果是疑问句） -> 节点 B 搜索答案 -> 结束。

1. 定义状态 (State)
   在 TS 中，首先要定义数据的“形状”。所有节点都共享这个对象。

```
import { Annotation } from "@langchain/langgraph";
// 定义状态：这是在节点间流动的“黑板”
const StateAnnotation = Annotation.Root({
    input: Annotation<string>,
    translation: Annotation<string>,
    isQuery: Annotation<boolean>,
    answer: Annotation<string>,
});
```

2. 编写节点 (Nodes) —— “先写工位”
   节点就是普通的异步函数。它们只负责处理数据，不负责决定下一步去哪。

```
// 节点 1: 翻译
const translateNode = async (state: typeof StateAnnotation.State) => {
console.log("---正在翻译---");

// 模拟逻辑：判断是否是问句
const isQuery = state.input.endsWith("?");
return { translation: `Translated: ${state.input}`, isQuery };
};

// 节点 2: 搜索答案
const searchNode = async (state: typeof StateAnnotation.State) => {
    console.log("---正在搜索答案---");
    return { answer: "Here is the answer from Google." };
};
```

3. 构建图 (Nodes + Edges) —— “后连铁轨”
   现在我们把工位摆好，再铺设轨道。

```
import { StateGraph, START, END } from "@langchain/langgraph";
const workflow = new StateGraph(StateAnnotation)
    // --- 第一步：添加节点 (Nodes) ---
    .addNode("translator", translateNode)
    .addNode("searcher", searchNode)

    // --- 第二步：添加边 (Edges) ---

    // 从起点开始，必须先去翻译
    .addEdge(START, "translator")

    // 添加条件边：根据翻译结果决定去哪
    .addConditionalEdges(
        "translator", // 从哪个节点出来
        (state) => (state.isQuery ? "go_search" : "go_end"), // 路由函数
        {
            go_search: "searcher", // 如果返回 go_search，去 searcher 节点
            go_end: END, // 如果返回 go_end，直接结束
        }
    )

    // 如果去了搜索，搜完就结束
    .addEdge("searcher", END);
```

4. 编译并运行
   最后一步，将设计图转化为可执行的程序。

```
    const app = workflow.compile();
    // 运行测试const result = await app.invoke({ input: "什么是 LangGraph?" });
    console.log(result);
```

---

** 为什么这个顺序（先 Node 后 Edge）？**

1.  类型安全 (Type Safety)：
    在 addNode("translator", translateNode) 时，TS 会校验 translateNode 的输入输出是否符合 StateAnnotation 的定义。
2.  路径验证：
    在 addConditionalEdges 的映射表（Map）中，如果你写了一个不存在的节点名（比如 go_search: "wrong_node"），TS 和 LangGraph 在编译期就能拦截这个错误。
3.  可视化思维：
    先确定“我有几个功能模块”，再确定“逻辑流转轨迹”。这符合编写复杂 AI Agent 的直觉——你得先有工具（Nodes），才能想怎么用工具（Edges）。
