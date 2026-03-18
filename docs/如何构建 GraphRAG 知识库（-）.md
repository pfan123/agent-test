# 如何构建 GraphRAG 知识库（-）

构建 GraphRAG（图增强检索生成）的核心在于将非结构化的文本转化为“实体-关系-实体”的三元组，并建立索引。相比传统 RAG，它能处理“总结全文”或“跨文档关联”的复杂问题。
以下是构建 GraphRAG 知识库的标准流程：

1. 技术栈准备

- 图数据库：Neo4j（最成熟，支持 Cypher 语言）或 NebulaGraph。
- LLM：用于提取实体和关系（推荐 GPT-4o 或 Claude 3.5，逻辑提取能力强）。
- 框架：LangGraph（负责编排提取流）或 Microsoft GraphRAG（微软开源的现成工具）。

---

2. 构建流程（核心四步骤）第一步：索引与切片 (Indexing & Chunking)
   将长文档切分成文本块（Chunks）。

- 注意：切片可以比传统 RAG 稍大（如 600-1000 tokens），以保持上下文的语义完整性，方便提取关系。

第二步：实体与关系提取 (Entity & Relation Extraction)
这是最关键的一步。利用 LLM 扫描每个文本块，识别出：

- Nodes（节点）：人名、公司、技术术语、地点等。
- Edges（边）：A “雇佣” B，C “位于” D，E “解决了” F。
- 属性：节点的描述、出现频率等。

第三步：社区发现 (Community Detection) —— GraphRAG 的精髓
这是微软 GraphRAG 方案引入的高级步骤：

- 使用算法（如 Leiden 算法）将紧密相关的节点划分成不同的“社区”（Communities）。
- 对每个社区生成摘要报告。
- 作用：当用户问全景问题（如“这个项目的主要风险是什么？”）时，系统直接检索社区摘要，而不需要遍历几万个碎片。

第四步：嵌入与存储 (Embedding & Storage)

- 将提取的节点描述和社区摘要进行 Vector Embedding。
- 将三元组结构存入图数据库，将向量存入向量数据库（或 Neo4j 向量索引）。

---

3. 代码实现逻辑 (TypeScript 伪代码)
   在 LangGraph 中，你可以写一个 Node 专门负责解析并写入图谱：

async function extractToGraph(state: typeof State.State) {
const text = state.currentChunk;

// 1. 让 LLM 提取三元组
const triples = await llm.withStructuredOutput(TripleSchema).invoke(
`从以下文本提取实体关系：${text}`
);

// 2. 写入 Neo4j
for (const { source, relation, target } of triples) {
await neo4j.run(
`MERGE (a:Entity {name: $source}) 
       MERGE (b:Entity {name: $target}) 
       MERGE (a)-[r:RELATION {type: $relation}]->(b)`,
{ source, target, relation }
);
}
return { status: "processed" };
}

---

4. 检索阶段 (Retrieval)
   构建好知识库后，查询流程如下：
   1. 关键词提取：从用户问题提取核心实体。
   2. 多跳搜索：在图数据库中搜索该实体周围 1-3 层 的关联节点。
   3. 上下文重组：将搜到的关系链转为文字，交给 LLM 生成答案。

5. 建议工具

- 如果你想快速上手：直接使用微软的 GraphRAG Python 库，它自动完成了上述所有流程。
- 如果你想深度定制：在 LangGraph 中手动实现提取 Node，这样你可以自定义提取的实体类型（比如专门提取“法律条款”或“代码调用链”）。

6. 基于 LangGraph (Node.js) 手动实现
   由于你已经在研究 LangGraph (JS/TS)，完全可以利用它在 Node.js 中手动构建 GraphRAG 逻辑：
1. 使用 LLM 将非结构化文本解析为三元组。
1. 将数据存储到 [Neo4j](https://neo4j.com/blog/news/graphrag-python-package/) 等图数据库中。
1. 通过 Cypher 语句在 LangGraph 的 Node 中实现多跳查询逻辑。
