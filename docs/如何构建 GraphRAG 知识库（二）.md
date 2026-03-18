# 如何构建 GraphRAG 知识库（二）

在前端或 Node.js 环境下，将知识库文件转化为图谱的核心在于 “语义分片” 与 “迭代提取”。由于 LLM 的上下文窗口有限，不能一次性丢入整本书，必须分批处理并保持实体的连贯性。
以下是详细的逻辑实现步骤：

1. 文件读取与语义切片 (Chunking)
   不要使用简单的字符计数切片，建议使用 RecursiveCharacterTextSplitter，它会尝试按段落、句子换行符切分，保证语义不被切断。

```
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";

// 1. 加载文件
const loader = new PDFLoader("path/to/manual.pdf");
const docs = await loader.load();

// 2. 语义切片
const splitter = new RecursiveCharacterTextSplitter({
  chunkSize: 800,      // 建议 800-1000 字符，太小会导致关系丢失
  chunkOverlap: 150,   // 必须有重叠，确保跨片的关系能被捕获
});
const chunks = await splitter.splitDocuments(docs);
```

2. 定义三元组提取的“逻辑协议” (Schema)
   利用 Zod 强制要求 LLM 输出标准格式。这一步是保证数据能直接存入数据库的关键。

```
import { z } from "zod";

const TripleSchema = z.object({
  subject: z.string().describe("主体实体，如 '星辰科技'"),
  predicate: z.string().describe("动词或关系描述，如 '研发'、'位于'"),
  object: z.string().describe("客体实体或属性值，如 'AI芯片'、'北京'"),
  subjectType: z.string().describe("主体类别，如 '公司'、'人物'"),
  objectType: z.string().describe("客体类别，如 '产品'、'地点'"),
});

const ExtractionResult = z.object({
  triples: z.array(TripleSchema),
});

```

3. 构建 LangGraph 迭代提取节点
   为了处理成百上千个切片，我们构建一个 LangGraph 循环，逐个处理切片并实时写入图谱。
   核心逻辑流程：
   1. 输入：切片列表。
   2. LLM 任务：分析当前文本，提取实体和关系。
   3. 实体归一化 (Entity Resolution)：告诉 LLM 参考已提取的实体，防止“Apple”和“苹果公司”重复。

```
const extractTriplesNode = async (state: typeof State.State) => {
  const currentChunk = state.chunks[state.currentIndex];
  const model = new ChatOpenAI({ modelName: "gpt-4o", temperature: 0 });
  const structuredLlm = model.withStructuredOutput(ExtractionResult);

  // 这里的 Prompt 极其关键
  const prompt = `
    你是一个知识图谱专家。从以下文本中提取关键的实体关系三元组。
    注意：
    1. 实体名称要简洁、准确（归一化）。
    2. 如果提到过往实体，请保持名称一致。
    文本内容：${currentChunk.pageContent}
  `;

  const result = await structuredLlm.invoke(prompt);

  // 4. 持久化到 Neo4j
  for (const t of result.triples) {
    await neo4j.run(
      `MERGE (s:Entity {name: $sub, type: $sType})
       MERGE (o:Entity {name: $obj, type: $oType})
       MERGE (s)-[r:RELATION {label: $pred}]->(o)`,
      { sub: t.subject, obj: t.object, pred: t.predicate, sType: t.subjectType, oType: t.objectType }
    );
  }

  return { currentIndex: state.currentIndex + 1 };
};

```

4. 细化逻辑：如何提高提取质量？

- 指代消解 (Coreference Resolution)：
  如果第一段写“马斯克”，第二段写“他”，单独看第二段 LLM 无法提取。
  技巧：在 chunkOverlap 中保留足够上下文，并在 Prompt 中要求 LLM 结合上下文还原指代对象。
- 关系去重：
  多个切片可能提到同一个关系。Neo4j 的 MERGE 语句会自动处理重复的节点和边，避免数据冗余。
- 属性增强：
  除了 Subject-Predicate-Object，可以额外提取一个 description 存入节点的属性中。GraphRAG 的强大之处在于：当搜索到节点时，LLM 能读到该实体的背景描述。

5. 架构总结

- 前端/Node 层：负责文件读取、切片编排、并发控制。
- LLM 层：负责语义解析、结构化输出。
- 存储层 (Neo4j)：负责维护实体间的拓扑网络。
