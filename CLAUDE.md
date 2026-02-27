# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

This is a tutorial repository for learning AI Agent development, focusing on LangGraph and LangChain implementations. The codebase demonstrates various agent patterns including ReAct, Plan-and-Execute, and MCP-driven agents. Documentation is primarily in Chinese.

## Project Structure

This is a pnpm monorepo with workspace configuration:

```
agent-tutorial/
├── apps/
│   ├── langchain/     # LangGraph-based agents
│   └── openai/        # OpenAI API examples
├── docs/              # Chinese documentation on Agent concepts
└── .claude/           # Claude Code configuration
```

## Commands

### Running Applications

Each app has its own package.json with a `start` script. Run from the app directory:

```bash
# LangChain agent (calculator with Ollama or OpenAI + Tavily)
cd apps/langchain && pnpm start

# OpenAI agent (basic responses API)
cd apps/openai && pnpm start
```

### Installation

```bash
# Install all dependencies
pnpm install

# Install specific app dependencies
cd apps/langchain && pnpm install
cd apps/openai && pnpm install
```

## Architecture

### LangChain Agent (`apps/langchain/`)

The langchain app contains two main agent implementations:

1. **Calculator Agent** (`index.ts`):
   - Uses Ollama with local `qwen3-vl:8b` model
   - Implements custom arithmetic tools (add, multiply, divide)
   - Custom LangGraph StateGraph implementation with tool binding
   - Demonstrates state management with custom reducers (`llmCalls`)

2. **ReAct Agent** (`agent.ts`):
   - Uses OpenAI API with Tavily search integration
   - Pre-built `createReactAgent` from LangGraph
   - Memory persistence with `MemorySaver` checkpointer
   - Thread-based conversation context (uses `thread_id`)

### State Management Pattern

LangGraph agents use this pattern:
- Define state with `Annotation.Root()` extending `MessagesAnnotation`
- Create nodes that return state updates
- Use conditional edges with `shouldContinue` logic
- Compile with optional checkpointer for persistence

### Tool Definition Pattern

Tools are defined using `@langchain/core/tools`:
```typescript
const toolName = tool(({ params }) => result, {
  name: "toolName",
  description: "What it does",
  schema: z.object({ /* zod validation */ }),
});
```

## Key Dependencies

- `@langchain/langgraph` - Stateful agent workflows
- `@langchain/ollama` - Local model integration
- `@langchain/openai` - OpenAI API integration
- `@modelcontextprotocol/sdk` - MCP protocol support
- `tsx` - TypeScript execution

## Development Notes

### Prerequisites

For the calculator agent to work, Ollama must be running locally:
```bash
ollama serve  # Runs on http://127.0.0.1:11434
```

### API Keys

The `agent.ts` file requires environment variables (set at top of file):
- `OPENAI_API_KEY` - OpenAI API key
- `TAVILY_API_KEY` - Tavily search API key

### Model Configuration

The calculator uses `qwen3-vl:8b` by default. To use different Ollama models, modify the `model` parameter in `ChatOllama` constructor.

## Documentation

The `docs/` folder contains Chinese documentation on:
- **Agent思考框架.md** - Comprehensive comparison of 2026 Agent architectures (ReAct, Plan-and-Execute, CoT, Reflexion, Tree of Thoughts, Memory-Centric, MCP-driven)
- **概念.md** - Core concepts including Agentic RAG, A2A (Agent-to-Agent) protocols, MCP vs A2A scope differences
- **大模型本地化部署调试.md** - Local model deployment with Ollama
