import { Annotation } from "@langchain/langgraph";

export const MessagesState = Annotation.Root({
  messages: Annotation({
    reducer: (a, b) => a.concat(b),
    default: () => [],
  }),
});
