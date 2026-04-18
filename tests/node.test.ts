import { describe, it, expect, vi } from "vitest";
import { processSignal } from "../src/graph/node.js";
import type { AgentConfig, RawEvent, Signal } from "../src/types.js";
import { FakeListChatModel } from "@langchain/core/utils/testing";

const agentConfig: AgentConfig = {
  id: "test_agent",
  prompt: "You analyze events.",
  model: "claude-sonnet-4-6",
  tools: [],
  children: [],
};

const rawEvent: RawEvent = {
  id: "evt_1",
  source: "system",
  payload: { type: "alert", value: 42 },
  timestamp: new Date().toISOString(),
};

const incomingSignal: Signal = {
  id: "sig_0",
  fromAgent: "leaf",
  toAgent: "root",
  severity: "info",
  payload: { processed: true },
  trace: [{ agentId: "leaf", summary: "leaf fired", firedAt: new Date().toISOString() }],
  timestamp: new Date().toISOString(),
};

describe("processSignal", () => {
  it("returns fire decision when model outputs fire JSON", async () => {
    const model = new FakeListChatModel({
      responses: ['{"action":"fire","severity":"warning","summary":"Value spike detected","payload":{"value":42}}'],
    });

    const decision = await processSignal(rawEvent, agentConfig, { model, tools: [] });

    expect(decision.action).toBe("fire");
    if (decision.action === "fire") {
      expect(decision.severity).toBe("warning");
      expect(decision.summary).toBe("Value spike detected");
    }
  });

  it("returns silent decision when model outputs silent JSON", async () => {
    const model = new FakeListChatModel({
      responses: ['{"action":"silent"}'],
    });

    const decision = await processSignal(rawEvent, agentConfig, { model, tools: [] });
    expect(decision.action).toBe("silent");
  });

  it("defaults to silent when model output is unparseable", async () => {
    const model = new FakeListChatModel({
      responses: ["I have analyzed the event and found nothing of concern."],
    });

    const decision = await processSignal(rawEvent, agentConfig, { model, tools: [] });
    expect(decision.action).toBe("silent");
  });

  it("parses fire JSON embedded in prose text", async () => {
    const model = new FakeListChatModel({
      responses: [
        'After analyzing the event, I conclude this is significant.\n{"action":"fire","severity":"critical","summary":"Critical threshold exceeded","payload":{"count":100}}\nThat is my assessment.',
      ],
    });

    const decision = await processSignal(rawEvent, agentConfig, { model, tools: [] });
    expect(decision.action).toBe("fire");
    if (decision.action === "fire") {
      expect(decision.severity).toBe("critical");
      expect(decision.summary).toBe("Critical threshold exceeded");
    }
  });

  it("accepts a Signal input (not just RawEvent)", async () => {
    const model = new FakeListChatModel({
      responses: ['{"action":"fire","severity":"info","summary":"re-fired","payload":{}}'],
    });

    const decision = await processSignal(incomingSignal, agentConfig, { model, tools: [] });
    expect(decision.action).toBe("fire");
  });

  it("prefers last action JSON when multiple objects appear in output", async () => {
    const model = new FakeListChatModel({
      responses: [
        '{"action":"fire","severity":"info","summary":"first","payload":{}}\n{"action":"silent"}',
      ],
    });

    const decision = await processSignal(rawEvent, agentConfig, { model, tools: [] });
    // Last JSON object wins
    expect(decision.action).toBe("silent");
  });
});
