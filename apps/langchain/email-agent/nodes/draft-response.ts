import { Command, interrupt, GraphNode, END } from "@langchain/langgraph";
import { HumanMessage } from "@langchain/core/messages";
import { ChatOllama } from "@langchain/ollama";
import { EmailAgentState } from "../email-agent-state";

const llm = new ChatOllama({
  model: "qwen3-vl:8b",
  temperature: 0,
});

const draftResponse: GraphNode<typeof EmailAgentState> = async (
  state,
  config,
) => {
  // Generate response using context and route based on quality

  const classification = state.classification!;

  // Simple response generation for testing
  let responseText = "";
  if (classification.intent === "question") {
    responseText = "Thank you for your question. I'll help you with that.";
  } else if (classification.intent === "billing") {
    responseText = "Regarding your billing inquiry, please check your account.";
  } else {
    responseText = "Thank you for your email. We'll get back to you soon.";
  }

  console.log("Draft response:", responseText);

  // Determine if human review needed based on urgency and intent
  const needsReview =
    classification.urgency === "high" ||
    classification.urgency === "critical" ||
    classification.intent === "complex";

  // Route to appropriate next node
  const nextNode = needsReview ? "humanReview" : "sendReply";

  return new Command({
    update: { responseText },
    goto: nextNode,
  });
};

export { draftResponse };
