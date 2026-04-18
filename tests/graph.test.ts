import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { FakeListChatModel } from "@langchain/core/utils/testing";
import { Engine } from "../src/graph/builder.js";
import { NodeStore, RunStore } from "../src/api/store.js";
import type { TreeConfig } from "../src/types.js";

const threeAgentConfig: TreeConfig = {
  version: 1,
  root: "root",
  agents: [
    {
      id: "root",
      prompt: "You synthesize signals from children.",
      model: "claude-sonnet-4-6",
      tools: [],
      children: ["leaf_a", "leaf_b"],
    },
    {
      id: "leaf_a",
      prompt: "You analyze type-A data.",
      model: "claude-sonnet-4-6",
      tools: [],
      children: [],
    },
    {
      id: "leaf_b",
      prompt: "You analyze type-B data.",
      model: "claude-sonnet-4-6",
      tools: [],
      children: [],
    },
  ],
};

function makeEngine(defaultResponse: string, debug = false) {
  const nodeStore = new NodeStore();
  const runStore = new RunStore();
  const modelFactory = async (_modelId: string) =>
    new FakeListChatModel({ responses: [defaultResponse, defaultResponse, defaultResponse] });

  const engine = new Engine(threeAgentConfig, modelFactory, nodeStore, runStore, "./workspace", debug);
  engine.start();
  return { engine, nodeStore, runStore };
}

function waitForRun(runStore: RunStore, runId: string, timeoutMs = 5000): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      const run = runStore.get(runId);
      if (run && run.status !== "running") return resolve();
      if (Date.now() - start > timeoutMs) return reject(new Error("Run timed out"));
      setTimeout(check, 50);
    };
    check();
  });
}

describe("Engine integration", () => {
  afterEach(() => {
    // Clean up trace logs created during tests
    try {
      const files = fs.readdirSync("./logs");
      for (const f of files) {
        if (f.startsWith("trace-")) fs.unlinkSync(path.join("./logs", f));
      }
    } catch {
      // logs dir may not exist
    }
  });

  it("submitRun returns a runId and run is created", () => {
    const { engine, runStore } = makeEngine('{"action":"silent"}');
    const runId = engine.submitRun({
      id: "evt_1",
      source: "system",
      payload: { test: true },
      timestamp: new Date().toISOString(),
    });
    expect(runId).toMatch(/^run_/);
    expect(runStore.get(runId)?.status).toBe("running");
  });

  it("both leaves process event and root runs when both fire", async () => {
    const fireResponse = '{"action":"fire","severity":"info","summary":"test summary","payload":{"ok":true}}';
    const { engine, runStore, nodeStore } = makeEngine(fireResponse);

    const runId = engine.submitRun({
      id: "evt_2",
      source: "system",
      payload: { alert: "high" },
      timestamp: new Date().toISOString(),
    });

    await waitForRun(runStore, runId);

    const run = runStore.get(runId);
    expect(run?.status).toBe("complete");

    // Root fires once per child signal; trace = [leaf, root] = 2 entries per path
    const rootStatus = nodeStore.get("root");
    expect(rootStatus.lastSignal?.trace.length).toBe(2);
    expect(rootStatus.lastSignal?.trace.some((t) => t.agentId === "root")).toBe(true);
  });

  it("run is silent when root stays silent", async () => {
    const { engine, runStore } = makeEngine('{"action":"silent"}');

    const runId = engine.submitRun({
      id: "evt_3",
      source: "system",
      payload: { quiet: true },
      timestamp: new Date().toISOString(),
    });

    await waitForRun(runStore, runId);
    expect(runStore.get(runId)?.status).toBe("silent");
  });

  it("trace log contains correct agentId and fired fields", async () => {
    const fireResponse = '{"action":"fire","severity":"warning","summary":"found issue","payload":{}}';
    const { engine, runStore } = makeEngine(fireResponse, true); // debug=true to enable log

    const runId = engine.submitRun({
      id: "evt_4",
      source: "system",
      payload: { value: 99 },
      timestamp: new Date().toISOString(),
    });

    await waitForRun(runStore, runId);

    const logPath = path.join("./logs", `trace-${runId}.jsonl`);
    expect(fs.existsSync(logPath)).toBe(true);

    const entries = fs.readFileSync(logPath, "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));

    // Every entry must have agentId, fired, input, output, timestamp
    for (const entry of entries) {
      expect(entry).toHaveProperty("agentId");
      expect(entry).toHaveProperty("fired");
      expect(entry).toHaveProperty("input");
      expect(entry).toHaveProperty("timestamp");
    }

    // All agents that fired should have output signal
    const fired = entries.filter((e) => e.fired);
    for (const entry of fired) {
      expect(entry.output).not.toBeNull();
      expect(entry.output.fromAgent).toBe(entry.agentId);
    }

    const agentIds = entries.map((e) => e.agentId);
    expect(agentIds).toContain("leaf_a");
    expect(agentIds).toContain("leaf_b");
  });

  it("node error is recorded in NodeStore and run completes", async () => {
    const nodeStore = new NodeStore();
    const runStore = new RunStore();
    const modelFactory = async () => {
      throw new Error("LLM unavailable");
    };

    const engine = new Engine(threeAgentConfig, modelFactory, nodeStore, runStore, "./workspace", false);
    engine.start();

    const runId = engine.submitRun({
      id: "evt_5",
      source: "system",
      payload: {},
      timestamp: new Date().toISOString(),
    });

    await waitForRun(runStore, runId);

    // Both leaves errored; run should reach terminal state
    expect(runStore.get(runId)?.status).not.toBe("running");
    expect(nodeStore.get("leaf_a").state).toBe("error");
    expect(nodeStore.get("leaf_b").state).toBe("error");
  });

  it("does not write trace log when debug is false", async () => {
    const fireResponse = '{"action":"fire","severity":"info","summary":"ok","payload":{}}';
    const { engine, runStore } = makeEngine(fireResponse, false); // default: no debug

    const runId = engine.submitRun({
      id: "evt_nodebug",
      source: "system",
      payload: {},
      timestamp: new Date().toISOString(),
    });

    await waitForRun(runStore, runId);

    const logPath = path.join("./logs", `trace-${runId}.jsonl`);
    expect(fs.existsSync(logPath)).toBe(false);
  });

  it("submitToNode injects directly into a specific node", async () => {
    const fireResponse = '{"action":"fire","severity":"info","summary":"direct inject","payload":{}}';
    const { engine, runStore, nodeStore } = makeEngine(fireResponse);

    const { queueDepth } = engine.submitToNode("leaf_a", { direct: true }, "test", []);
    expect(typeof queueDepth).toBe("number");

    // Wait for leaf_a to process
    await new Promise<void>((resolve) => {
      const check = () => {
        if (nodeStore.get("leaf_a").processedCount > 0) return resolve();
        setTimeout(check, 50);
      };
      check();
    });

    expect(nodeStore.get("leaf_a").processedCount).toBeGreaterThan(0);
  });
});
