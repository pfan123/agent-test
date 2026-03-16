import { GraphNode } from "@langchain/langgraph";
import { EmailAgentState } from "../email-agent-state";

export const sendReply: GraphNode<typeof EmailAgentState> = async (
  state,
  config,
) => {
  // Send the email response
  // Integrate with email service
  console.log(`Sending reply: ${state.responseText!.substring(0, 100)}...`);
  return {};
};
