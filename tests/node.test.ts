import { describe, it, expect, vi } from "vitest";
import { processSignal } from "../src/graph/node.js";
import type { AgentConfig, RawEvent } from "../src/types.js";
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
});
