import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { DynamicStructuredTool } from "@langchain/core/tools";
import type { AgentConfig, LLMDecision, RawEvent, Signal } from "../types.js";

const DECISION_SUFFIX = `
At the end of your analysis, output ONLY a valid JSON object on its own line (no markdown, no explanation):
{"action":"fire","severity":"critical|warning|info","summary":"one sentence summary","payload":{...}}
OR
{"action":"silent"}
`;

function parseDecision(text: string): LLMDecision {
  // Walk through the text and extract all top-level JSON objects
  const objects: string[] = [];
  let depth = 0;
  let start = -1;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (text[i] === "}") {
      depth--;
      if (depth === 0 && start !== -1) {
        objects.push(text.slice(start, i + 1));
        start = -1;
      }
    }
  }

  // Use last object that has an "action" field
  for (let i = objects.length - 1; i >= 0; i--) {
    try {
      const raw = JSON.parse(objects[i]) as Record<string, unknown>;
      if (raw.action === "fire") {
        return {
          action: "fire",
          severity: (raw.severity as "critical" | "warning" | "info") ?? "info",
          summary: String(raw.summary ?? ""),
          payload: raw.payload ?? {},
        };
      }
      if (raw.action === "silent") return { action: "silent" };
    } catch {
      // Skip non-parseable objects
    }
  }

  return { action: "silent" };
}

export async function processSignal(
  signal: RawEvent | Signal,
  config: AgentConfig,
  deps: { model: BaseChatModel; tools: DynamicStructuredTool[] }
): Promise<LLMDecision> {
  const systemPrompt = config.prompt.trim() + "\n" + DECISION_SUFFIX;
  const userMessage = JSON.stringify(signal, null, 2);
  const messages = [new SystemMessage(systemPrompt), new HumanMessage(userMessage)];

  let content: string;

  if (deps.tools.length === 0) {
    // No tools — call model directly, no ReAct loop needed
    const result = await deps.model.invoke(messages);
    content = typeof result.content === "string" ? result.content : JSON.stringify(result.content);
  } else {
    const agent = createReactAgent({ llm: deps.model, tools: deps.tools });
    const result = await agent.invoke({ messages });
    const lastMessage = result.messages[result.messages.length - 1];
    content = typeof lastMessage.content === "string"
      ? lastMessage.content
      : JSON.stringify(lastMessage.content);
  }

  return parseDecision(content);
}
