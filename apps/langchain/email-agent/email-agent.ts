// @reffer https://docs.langchain.com/oss/javascript/langgraph/thinking-in-langgraph#llm-recoverable
import { tool } from "@langchain/core/tools";
import { StateGraph, START, END } from "@langchain/langgraph";
import { MemorySaver, Command, GraphInterrupt } from "@langchain/langgraph";
import { z } from "zod";
import { debug } from "@utils/debug";
import { EmailAgentState } from "./email-agent-state";
import { readEmail, classifyIntent } from "./nodes/classify-email-node";
import { searchDocumentation } from "./nodes/search-documentation";
import { bugTracking } from "./nodes/bug-tracking";
import { draftResponse } from "./nodes/draft-response";
import { humanReview } from "./nodes/human-review";
import { sendReply } from "./nodes/send-reply";
import { EmailAgentStateType, type ToolsByName } from "./types";

export let toolsByName: ToolsByName = {};

async function main() {
  console.log("📧 Email Agent 启动中...");

  // 初始化工具
  toolsByName = {
    classify_email: tool(
      async (params: { emailContent: string; senderEmail: string }) => {
        debug("分类邮件:", params);

        // 简单的分类逻辑，可以用 LLM 增强
        const content = params.emailContent.toLowerCase();
        let intent = "question";
        if (content.includes("bug") || content.includes("error")) {
          intent = "bug";
        } else if (content.includes("billing") || content.includes("payment")) {
          intent = "billing";
        } else if (content.includes("feature") || content.includes("request")) {
          intent = "feature";
        }

        let urgency = "medium";
        if (content.includes("urgent") || content.includes("asap")) {
          urgency = "high";
        }

        const topic = content.split(" ").slice(0, 5).join(" ");
        const summary = content.substring(0, 100);

        return JSON.stringify({
          intent,
          urgency,
          topic,
          summary,
        });
      },
      {
        name: "classify_email",
        description: "分类电子邮件内容，确定意图、紧急程度和主题",
        schema: z.object({
          emailContent: z.string().describe("邮件内容"),
          senderEmail: z.string().describe("发件人邮箱"),
        }),
      },
    ),
  };

  console.log("🎯 Email Agent (邮件分类与回复)");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  const emailContent =
    process.argv[2] || "Hello, I have a question about your product.";
  const senderEmail = process.argv[3] || "user@example.com";

  console.log(`邮件内容: ${emailContent}`);
  console.log(`发件人: ${senderEmail}\n`);

  const workflow = new StateGraph(EmailAgentState)
    .addNode("readEmail", readEmail)
    .addNode("classifyIntent", classifyIntent, {
      ends: [
        "searchDocumentation",
        "humanReview",
        "bugTracking",
        "draftResponse",
      ],
    })
    .addNode("searchDocumentation", searchDocumentation, {
      retryPolicy: { maxAttempts: 3, initialInterval: 1.0 },
      ends: ["draftResponse"],
    })
    .addNode("bugTracking", bugTracking, {
      ends: ["draftResponse"],
    })
    .addNode("draftResponse", draftResponse, {
      ends: ["humanReview", "sendReply"],
    })
    .addNode("humanReview", humanReview, { ends: ["sendReply", END] })
    .addNode("sendReply", sendReply)
    .addEdge(START, "readEmail")
    .addEdge("readEmail", "classifyIntent")
    .addEdge("sendReply", END);

  const agent = workflow.compile({ checkpointer: new MemorySaver() });
  agent.name = "Email Agent";

  let result;
  const config = { configurable: { thread_id: "unique_id_123" } };

  try {
    result = await agent.invoke(
      {
        messages: [`请处理这封邮件: ${emailContent} (发件人: ${senderEmail})`],
        emailContent,
        senderEmail,
        emailId: "test-123",
      },
      config,
    );
  } catch (error) {
    console.error("error", error);
    if (error instanceof GraphInterrupt) {
      console.log("检测到中断，正在自动模拟人工审批恢复...", error.interrupts);
      // 这里可以把 error.interrupts[0].value 返回给前端展示给用户

      await agent.invoke(
        new Command({
          resume: "批准执行此操作", // 这个字符串会变成 Node 里 const val = interrupt() 的返回值
        }),
        config,
      );
    } else {
      throw error;
    }
    debug("Agent error:", error);
  }

  if (result) {
    console.log("\n🎉 处理完成！");
    console.log("=== 回复 ===");
    console.log("Final state responseText:", result.responseText);
    console.log("Classification:", result.classification);
  } else {
    console.log("\n⚠️ 处理未完成，可能已中断等待人工决策。");
  }

  process.exit(0);
}

main().catch(console.error);

// pnpm exec tsx --tsconfig tsconfig.json ./email-agent/email-agent.ts "I have a question about your pricing plans. Can you explain the difference between the basic and premium tiers?" "customer@example.com"
