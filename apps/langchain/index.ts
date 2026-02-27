// Step 1: Define tools and model

import { ChatOllama } from "@langchain/ollama";
import { tool } from "@langchain/core/tools";
import { MemorySaver } from "@langchain/langgraph";
import * as z from "zod";

const model = new ChatOllama({
  model: "qwen3-vl:8b", // Default value.
  baseUrl:"http://127.0.0.1:11434",
  temperature: 0.7, 
  numPredict: 1000,
  topP: 0.7,
  frequencyPenalty: 0,
  presencePenalty: 0,
  streaming: true,
  think: true,
});
// Define tools
const add = tool(({ a, b }) => a + b, {
  name: "add",
  description: "Add two numbers",
  schema: z.object({
    a: z.number().describe("First number"),
    b: z.number().describe("Second number"),
  }),
});

const multiply = tool(({ a, b }) => a * b, {
  name: "multiply",
  description: "Multiply two numbers",
  schema: z.object({
    a: z.number().describe("First number"),
    b: z.number().describe("Second number"),
  }),
});

const divide = tool(({ a, b }) => a / b, {
  name: "divide",
  description: "Divide two numbers",
  schema: z.object({
    a: z.number().describe("First number"),
    b: z.number().describe("Second number"),
  }),
});

// Augment the LLM with tools
const toolsByName = {
  [add.name]: add,
  [multiply.name]: multiply,
  [divide.name]: divide,
};
const tools = Object.values(toolsByName);
const modelWithTools = model.bindTools(tools);

// Step 2: Define state

import { StateGraph, START, END, MessagesAnnotation, Annotation } from "@langchain/langgraph";

const MessagesState = Annotation.Root({
  ...MessagesAnnotation.spec,
  llmCalls: Annotation<number>({
    reducer: (x, y) => x + y,
    default: () => 0,
  }),
});

// Extract the state type for function signatures
type MessagesStateType = typeof MessagesState.State;

// Step 3: Define model node

import { SystemMessage } from "@langchain/core/messages";

async function llmCall(state: MessagesStateType) {
  return {
    messages: [await modelWithTools.invoke([
      new SystemMessage(
        "你是一名乐于助人的助手，任务是对一组输入数据进行算术运算。"
      ),
      ...state.messages,
    ])],
    llmCalls: 1,
  };
}

// Step 4: Define tool node

import { AIMessage, ToolMessage } from "@langchain/core/messages";

async function toolNode(state: MessagesStateType) {
  const lastMessage = state.messages.at(-1);

  if (lastMessage == null || !AIMessage.isInstance(lastMessage)) {
    return { messages: [] };
  }

  // const checkPointer = new MemorySaver();

  // await interrupt('我是拦截器，我拦截了工具调用的执行过程');

  const result: ToolMessage[] = [];
  for (const toolCall of lastMessage.tool_calls ?? []) {
    const tool = toolsByName[toolCall.name];
    const observation = await tool.invoke(toolCall);
    result.push(observation);
  }

  return { messages: result };
}

// Step 5: Define logic to determine whether to end

async function shouldContinue(state: MessagesStateType) {
  const lastMessage = state.messages.at(-1);

  // Check if it's an AIMessage before accessing tool_calls
  if (!lastMessage || !AIMessage.isInstance(lastMessage)) {
    return END;
  }

  // If the LLM makes a tool call, then perform an action
  if (lastMessage.tool_calls?.length) {
    return "toolNode";
  }

  // Otherwise, we stop (reply to the user)
  return END;
}

// Step 6: Build and compile the agent

const agent = new StateGraph(MessagesState)
  .addNode("llmCall", llmCall)
  .addNode("toolNode", toolNode)
  .addEdge(START, "llmCall")
  .addConditionalEdges("llmCall", shouldContinue, ["toolNode", END])
  .addEdge("toolNode", "llmCall")
  .compile();

agent.name = "New Agent";

// Invoke
const result = await agent.invoke({
  messages: ["Multiply 10 and 4."],
});

for (const message of result.messages) {
  console.log(`[${message.type}]: ${message.content}`);
}