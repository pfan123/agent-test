import { GraphNode, Command } from "@langchain/langgraph";
import { ChatOllama } from "@langchain/ollama";
import {
  EmailAgentState,
  EmailClassificationSchema,
} from "../email-agent-state";
import { de } from "zod/v4/locales";
import { debug } from "console";

const llm = new ChatOllama({
  model: "qwen3-vl:8b",
  baseUrl: "http://127.0.0.1:11434",
  temperature: 0.7,
  numPredict: 1024,
  streaming: false,
  think: false,
});

export const readEmail: GraphNode<typeof EmailAgentState> = async (
  state,
  config,
) => {
  // Extract and parse email content
  // In production, this would connect to your email service
  console.log(`Processing email: ${state.emailContent}`);
  return {};
};

export const classifyIntent: GraphNode<typeof EmailAgentState> = async (
  state,
  config,
) => {
  // Simple classification logic for testing
  const content = state.emailContent.toLowerCase();

  let intent: "question" | "bug" | "billing" | "feature" | "complex" =
    "question";
  if (content.includes("bug") || content.includes("error")) {
    intent = "bug";
  } else if (
    content.includes("billing") ||
    content.includes("payment") ||
    content.includes("pricing")
  ) {
    intent = "billing";
  } else if (content.includes("feature") || content.includes("request")) {
    intent = "feature";
  }

  let urgency: "low" | "medium" | "high" | "critical" = "medium";
  if (content.includes("urgent") || content.includes("asap")) {
    urgency = "high";
  } else if (content.includes("immediately") || content.includes("critical")) {
    urgency = "critical";
  }

  const classification = {
    intent,
    urgency,
    topic: content.split(" ").slice(0, 5).join(" "),
    summary: content.substring(0, 100),
  };

  console.log("Classification:", classification);

  // Determine next node based on classification
  let nextNode:
    | "searchDocumentation"
    | "humanReview"
    | "draftResponse"
    | "bugTracking";

  if (
    classification.intent === "billing" ||
    classification.urgency === "critical"
  ) {
    nextNode = "humanReview";
  } else if (
    classification.intent === "question" ||
    classification.intent === "feature"
  ) {
    nextNode = "searchDocumentation";
  } else if (classification.intent === "bug") {
    nextNode = "bugTracking";
  } else {
    nextNode = "draftResponse";
  }

  debug("Routing to:", nextNode);

  // Store classification as a single object in state
  return new Command({
    update: { classification },
    goto: nextNode,
  });
};
