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

const VALID_SEVERITY = new Set(["critical", "warning", "info"]);

function contentOf(c: unknown): string {
  return typeof c === "string" ? c : JSON.stringify(c);
}

function parseDecision(text: string): LLMDecision {
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

  for (let i = objects.length - 1; i >= 0; i--) {
    try {
      const raw = JSON.parse(objects[i]) as Record<string, unknown>;
      if (raw.action === "fire") {
        const severity = VALID_SEVERITY.has(String(raw.severity))
          ? (raw.severity as "critical" | "warning" | "info")
          : "info";
        return { action: "fire", severity, summary: String(raw.summary ?? ""), payload: raw.payload ?? {} };
      }
      if (raw.action === "silent") return { action: "silent" };
    } catch {
      // skip non-parseable
    }
  }

  return { action: "silent" };
}

export async function processSignal(
  signal: RawEvent | Signal,
  config: AgentConfig,
  deps: { model: BaseChatModel; tools: DynamicStructuredTool[] }
): Promise<LLMDecision> {
  const messages = [
    new SystemMessage(config.prompt.trim() + "\n" + DECISION_SUFFIX),
    new HumanMessage(JSON.stringify(signal, null, 2)),
  ];

  if (deps.tools.length === 0) {
    const result = await deps.model.invoke(messages);
    return parseDecision(contentOf(result.content));
  }

  const agent = createReactAgent({ llm: deps.model, tools: deps.tools });
  const result = await agent.invoke({ messages });
  const last = result.messages[result.messages.length - 1];
  return parseDecision(contentOf(last.content));
}
