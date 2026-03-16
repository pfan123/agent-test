import { Command, interrupt, GraphNode, END } from "@langchain/langgraph";
import { EmailAgentState } from "../email-agent-state";
import { debug } from "@utils/debug";

export const humanReview: GraphNode<typeof EmailAgentState> = async (
  state,
  config,
) => {
  // Pause for human review using interrupt and route based on decision
  const classification = state.classification!;

  // interrupt() must come first - any code before it will re-run on resume
  const humanDecision = interrupt({
    emailId: state.emailId,
    originalEmail: state.emailContent,
    draftResponse: state.responseText,
    urgency: classification.urgency,
    intent: classification.intent,
    action: "Please review and approve/edit this response",
  });

  debug("Human decision received:", humanDecision);

  // Now process the human's decision
  if (humanDecision.approved) {
    return new Command({
      update: {
        responseText: humanDecision.editedResponse || state.responseText,
      },
      goto: "sendReply",
    });
  } else {
    // Rejection means human will handle directly
    return new Command({ update: {}, goto: END });
  }
};
