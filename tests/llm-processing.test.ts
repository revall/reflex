/**
 * Tests that verify what each LLM level receives and how it processes signals.
 *
 * Strategy: a CapturingModel records every invoke() call so we can assert on
 * the exact system prompt and user message sent at each hop (leaf, middle, root).
 */
import { describe, it, expect } from "vitest";
import { AIMessage, type BaseMessage } from "@langchain/core/messages";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { Engine } from "../src/graph/builder.js";
import { NodeStore, RunStore } from "../src/api/store.js";
import type { RawEvent, Signal, TreeConfig } from "../src/types.js";

// ── CapturingModel ────────────────────────────────────────────────────────────
// Minimal BaseChatModel shim that records every invoke() call and returns
// a preset response. Avoids the FakeListChatModel bindTools limitation.

class CapturingModel {
  readonly calls: BaseMessage[][] = [];
  constructor(private readonly response: string) {}

  async invoke(messages: BaseMessage[]): Promise<AIMessage> {
    this.calls.push(messages);
    return new AIMessage(this.response);
  }

  // Engine calls modelFactory(modelId) which returns BaseChatModel.
  // Cast is safe because processSignal only calls .invoke() when tools=[].
  asModel(): BaseChatModel {
    return this as unknown as BaseChatModel;
  }
}

// ── tree: root ← middle ← leaf ───────────────────────────────────────────────

const TREE: TreeConfig = {
  version: 1,
  root: "root",
  agents: [
    {
      id: "root",
      prompt: "You are the root. Escalate if needed.",
      model: "root",
      tools: [],
      children: ["middle"],
    },
    {
      id: "middle",
      prompt: "You are the middle layer. Enrich the signal.",
      model: "middle",
      tools: [],
      children: ["leaf"],
    },
    {
      id: "leaf",
      prompt: "You are the leaf. Detect anomalies.",
      model: "leaf",
      tools: [],
      children: [],
    },
  ],
};

const FIRE = (summary: string, payload: object) =>
  `{"action":"fire","severity":"info","summary":"${summary}","payload":${JSON.stringify(payload)}}`;

function makeCapturingEngine() {
  const models: Record<string, CapturingModel> = {
    leaf:   new CapturingModel(FIRE("leaf processed", { raw: 42 })),
    middle: new CapturingModel(FIRE("middle processed", { enriched: true })),
    root:   new CapturingModel(FIRE("root processed", { escalated: true })),
  };

  const nodeStore = new NodeStore();
  const runStore = new RunStore();
  const modelFactory = async (modelId: string) => models[modelId]!.asModel();

  const engine = new Engine(TREE, modelFactory, nodeStore, runStore, "./workspace", false);
  engine.start();
  return { engine, models, runStore };
}

function waitForRun(runStore: RunStore, runId: string, timeoutMs = 5000): Promise<void> {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const check = () => {
      const run = runStore.get(runId);
      if (run && run.status !== "running") return resolve();
      if (Date.now() > deadline) return reject(new Error("Run timed out"));
      setTimeout(check, 50);
    };
    check();
  });
}

const RAW_EVENT: RawEvent = {
  id: "evt_test",
  source: "sensor",
  payload: { temperature: 98, unit: "celsius" },
  timestamp: "2026-04-18T10:00:00.000Z",
};

// ── tests ─────────────────────────────────────────────────────────────────────

describe("LLM processing — what each level receives", () => {
  it("leaf receives the raw event as its user message", async () => {
    const { engine, models, runStore } = makeCapturingEngine();
    const runId = engine.submitRun(RAW_EVENT);
    await waitForRun(runStore, runId);

    expect(models.leaf.calls.length).toBeGreaterThanOrEqual(1);
    const [systemMsg, userMsg] = models.leaf.calls[0];

    // User message is the JSON-serialised RawEvent
    const parsed = JSON.parse(userMsg.content as string) as RawEvent;
    expect(parsed.id).toBe(RAW_EVENT.id);
    expect(parsed.source).toBe("sensor");
    expect(parsed.payload).toEqual({ temperature: 98, unit: "celsius" });
  });

  it("leaf system prompt contains the configured agent prompt", async () => {
    const { engine, models, runStore } = makeCapturingEngine();
    const runId = engine.submitRun(RAW_EVENT);
    await waitForRun(runStore, runId);

    const systemContent = models.leaf.calls[0][0].content as string;
    expect(systemContent).toContain("You are the leaf. Detect anomalies.");
  });

  it("middle receives a Signal — not the raw event", async () => {
    const { engine, models, runStore } = makeCapturingEngine();
    const runId = engine.submitRun(RAW_EVENT);
    await waitForRun(runStore, runId);

    expect(models.middle.calls.length).toBeGreaterThanOrEqual(1);
    const userMsg = models.middle.calls[0][1];
    const parsed = JSON.parse(userMsg.content as string) as Signal;

    // Signal has fromAgent, not source
    expect(parsed.fromAgent).toBe("leaf");
    expect(parsed.toAgent).toBe("middle");
  });

  it("middle receives leaf's output payload in its user message", async () => {
    const { engine, models, runStore } = makeCapturingEngine();
    const runId = engine.submitRun(RAW_EVENT);
    await waitForRun(runStore, runId);

    const userMsg = models.middle.calls[0][1];
    const signal = JSON.parse(userMsg.content as string) as Signal;

    // Payload is what leaf decided to fire with
    expect(signal.payload).toEqual({ raw: 42 });
  });

  it("middle receives leaf's trace entry in the signal", async () => {
    const { engine, models, runStore } = makeCapturingEngine();
    const runId = engine.submitRun(RAW_EVENT);
    await waitForRun(runStore, runId);

    const userMsg = models.middle.calls[0][1];
    const signal = JSON.parse(userMsg.content as string) as Signal;

    expect(signal.trace).toHaveLength(1);
    expect(signal.trace[0].agentId).toBe("leaf");
    expect(signal.trace[0].summary).toBe("leaf processed");
  });

  it("root receives a Signal from middle with 2-entry trace", async () => {
    const { engine, models, runStore } = makeCapturingEngine();
    const runId = engine.submitRun(RAW_EVENT);
    await waitForRun(runStore, runId);

    expect(models.root.calls.length).toBeGreaterThanOrEqual(1);
    const userMsg = models.root.calls[0][1];
    const signal = JSON.parse(userMsg.content as string) as Signal;

    expect(signal.fromAgent).toBe("middle");
    expect(signal.toAgent).toBe("root");
    expect(signal.payload).toEqual({ enriched: true });
    expect(signal.trace).toHaveLength(2);
    expect(signal.trace[0].agentId).toBe("leaf");
    expect(signal.trace[1].agentId).toBe("middle");
  });

  it("root system prompt contains the configured root prompt", async () => {
    const { engine, models, runStore } = makeCapturingEngine();
    const runId = engine.submitRun(RAW_EVENT);
    await waitForRun(runStore, runId);

    const systemContent = models.root.calls[0][0].content as string;
    expect(systemContent).toContain("You are the root. Escalate if needed.");
  });

  it("each level is called exactly once per run in a 3-level chain", async () => {
    const { engine, models, runStore } = makeCapturingEngine();
    const runId = engine.submitRun(RAW_EVENT);
    await waitForRun(runStore, runId);

    expect(models.leaf.calls).toHaveLength(1);
    expect(models.middle.calls).toHaveLength(1);
    expect(models.root.calls).toHaveLength(1);
  });

  it("system prompt includes the decision format instructions at every level", async () => {
    const { engine, models, runStore } = makeCapturingEngine();
    const runId = engine.submitRun(RAW_EVENT);
    await waitForRun(runStore, runId);

    for (const [nodeId, model] of Object.entries(models)) {
      const systemContent = model.calls[0][0].content as string;
      expect(systemContent, `[${nodeId}] missing fire/silent instruction`).toContain('"action":"fire"');
      expect(systemContent, `[${nodeId}] missing silent option`).toContain('"action":"silent"');
    }
  });
});
