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

function makeEngine(defaultResponse: string) {
  const nodeStore = new NodeStore();
  const runStore = new RunStore();
  // Each call to modelFactory creates a fresh model with the response available
  const modelFactory = async (_modelId: string) =>
    new FakeListChatModel({ responses: [defaultResponse, defaultResponse, defaultResponse] });

  const engine = new Engine(threeAgentConfig, modelFactory, nodeStore, runStore, "./workspace");
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

  it("trace log is written for completed run", async () => {
    const fireResponse = '{"action":"fire","severity":"warning","summary":"found issue","payload":{}}';
    const { engine, runStore } = makeEngine(fireResponse);

    const runId = engine.submitRun({
      id: "evt_4",
      source: "system",
      payload: { value: 99 },
      timestamp: new Date().toISOString(),
    });

    await waitForRun(runStore, runId);

    const logPath = path.join("./logs", `trace-${runId}.jsonl`);
    expect(fs.existsSync(logPath)).toBe(true);
    const lines = fs.readFileSync(logPath, "utf8").trim().split("\n");
    expect(lines.length).toBeGreaterThanOrEqual(1);
  });
});
