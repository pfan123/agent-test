# Langgraph + express部署

在 Node.js 环境下自建 LangGraph API，最成熟的方案是使用 Express (或 NestJS) 结合 PostgreSQL 存储，并通过 Server-Sent Events (SSE) 实现流式输出。

以下是实现这一架构的四个核心步骤：

### 1. 生产级持久化配置 (PostgreSQL)

在生产环境中，严禁使用 MemorySaver。你需要使用官方提供的 Postgres 检查点管理器，确保服务器重启后对话记录不丢失。

```
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";import { Pool } from "pg";
// 1. 创建数据库连接池const pool = new Pool({
  connectionString: process.env.DATABASE_URL, // 例如 postgres://user:password@localhost:5432/db
});
// 2. 初始化检查点管理器const checkpointer = new PostgresSaver(pool);
// 3. 这一步会自动在数据库中创建所需的表（只需执行一次）await checkpointer.setup();
// 4. 编译图const app = workflow.compile({ checkpointer });
```

## 2. 构建流式 API 接口 (Express + SSE)

使用 SSE (Server-Sent Events) 是关联 UI 最简单、最高效的方式，因为它原生支持浏览器流式解析。

```
import express from "express";const server = express();

server.post("/chat", async (req, res) => {
  const { message, threadId } = req.body;

  // 设置 SSE 响应头
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const config = { configurable: { thread_id: threadId } };

  try {
    // 使用 stream 模式
    const stream = await app.stream(
      { messages: [{ role: "user", content: message }] },
      { ...config, streamMode: "messages" }
    );

    for await (const [chunk, metadata] of stream) {
      // 只要消息内容有更新，就推送到前端
      if (chunk.content) {
        res.write(`data: ${JSON.stringify({
          text: chunk.content,
          node: metadata.langgraph_node
        })}\n\n`);
      }
    }
  } catch (error) {
    console.error("Stream Error:", error);
    res.write(`data: ${JSON.stringify({ error: "Internal Error" })}\n\n`);
  } finally {
    res.end();
  }
});
```

## 3. 处理中断与审批 (Human-in-the-loop)

在自建 API 中，你需要专门处理 GraphInterrupt 异常，将其转化为前端可识别的状态。

- 后端逻辑：当捕获到中断异常时，返回一个特殊的 JSON，告诉前端“现在停在 XX 节点，请审批”。
- 前端逻辑：展示审批按钮。
- 恢复接口：前端调用 /approve 接口，后端执行：

await app.invoke(new Command({ resume: "Approved" }), config);

## 4. 部署与运维重点

- 并发控制：Node.js 是单线程，但 PostgresSaver 保证了状态是线程安全的。多个请求通过不同的 thread_id 访问同一台服务器不会冲突。
- 超时管理：由于 LLM 生成可能超过 30 秒，如果使用 Nginx 转发，务必调大 proxy_read_timeout，否则连接会被 Nginx 强行切断。
- 环境变量管理：使用 dotenv 加密存储 API Keys。建议同时配置 LANGSMITH_API_KEY，这样你可以在 LangSmith 平台上实时看到线上 Agent 的运行路径轨迹图。

## 架构优势

这种方案的灵活性体现在：你可以随时在 Express 这一层加入用户身份验证（JWT）、请求限流（Rate Limit）以及自定义的日志审计逻辑，而这些是托管平台难以高度定制的。
