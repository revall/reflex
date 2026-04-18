import { describe, it, expect } from "vitest";
import { FakeListChatModel } from "@langchain/core/utils/testing";
import { Engine } from "../src/graph/builder.js";
import { NodeStore, RunStore } from "../src/api/store.js";
import { EngineEvents } from "../src/api/events.js";
import type { NodeUpdateEvent, RunUpdateEvent, SignalFiredEvent } from "../src/api/events.js";
import type { TreeConfig } from "../src/types.js";

const config: TreeConfig = {
  version: 1,
  root: "root",
  agents: [
    { id: "root",   prompt: "synthesize", model: "claude-sonnet-4-6", tools: [], children: ["leaf"] },
    { id: "leaf",   prompt: "detect",     model: "claude-sonnet-4-6", tools: [], children: [] },
  ],
};

const FIRE = '{"action":"fire","severity":"warning","summary":"spike detected","payload":{"v":1}}';
const SILENT = '{"action":"silent"}';

function makeEngine(response: string) {
  const nodeStore = new NodeStore();
  const runStore = new RunStore();
  const events = new EngineEvents();
  const modelFactory = async () => new FakeListChatModel({ responses: [response, response] });
  const engine = new Engine(config, modelFactory, nodeStore, runStore, "./workspace", false, events);
  engine.start();
  return { engine, nodeStore, runStore, events };
}

function waitForRun(runStore: RunStore, runId: string, ms = 5000): Promise<void> {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + ms;
    const check = () => {
      if (runStore.get(runId)?.status !== "running") return resolve();
      if (Date.now() > deadline) return reject(new Error("timeout"));
      setTimeout(check, 50);
    };
    check();
  });
}

describe("EngineEvents — SSE event emission", () => {
  it("emits node_update with state=processing when a node starts", async () => {
    const { engine, runStore, events } = makeEngine(FIRE);
    const updates: NodeUpdateEvent[] = [];
    events.on("node_update", (e) => updates.push(e));

    const runId = engine.submitRun({ id: "e1", source: "test", payload: {}, timestamp: new Date().toISOString() });
    await waitForRun(runStore, runId);

    const processingEvents = updates.filter((u) => u.state === "processing");
    expect(processingEvents.length).toBeGreaterThan(0);
    expect(processingEvents[0].nodeId).toBeTruthy();
  });

  it("emits node_update with severity after node fires", async () => {
    const { engine, runStore, events } = makeEngine(FIRE);
    const updates: NodeUpdateEvent[] = [];
    events.on("node_update", (e) => updates.push(e));

    const runId = engine.submitRun({ id: "e2", source: "test", payload: {}, timestamp: new Date().toISOString() });
    await waitForRun(runStore, runId);

    const firedUpdates = updates.filter((u) => u.severity !== null);
    expect(firedUpdates.length).toBeGreaterThan(0);
    expect(firedUpdates[0].severity).toBe("warning");
  });

  it("emits signal_fired with correct fromAgent, toAgent, severity, summary", async () => {
    const { engine, runStore, events } = makeEngine(FIRE);
    const fired: SignalFiredEvent[] = [];
    events.on("signal_fired", (e) => fired.push(e));

    const runId = engine.submitRun({ id: "e3", source: "test", payload: {}, timestamp: new Date().toISOString() });
    await waitForRun(runStore, runId);

    expect(fired.length).toBeGreaterThan(0);
    const leafFire = fired.find((f) => f.fromAgent === "leaf");
    expect(leafFire).toBeDefined();
    expect(leafFire!.toAgent).toBe("root");
    expect(leafFire!.severity).toBe("warning");
    expect(leafFire!.summary).toBe("spike detected");
    expect(Array.isArray(leafFire!.trace)).toBe(true);
  });

  it("emits run_update with status=complete when root fires", async () => {
    const { engine, runStore, events } = makeEngine(FIRE);
    const runUpdates: RunUpdateEvent[] = [];
    events.on("run_update", (e) => runUpdates.push(e));

    const runId = engine.submitRun({ id: "e4", source: "test", payload: {}, timestamp: new Date().toISOString() });
    await waitForRun(runStore, runId);

    const complete = runUpdates.find((r) => r.status === "complete");
    expect(complete).toBeDefined();
    expect(complete!.runId).toBe(runId);
  });

  it("emits run_update with status=silent when all nodes stay silent", async () => {
    const { engine, runStore, events } = makeEngine(SILENT);
    const runUpdates: RunUpdateEvent[] = [];
    events.on("run_update", (e) => runUpdates.push(e));

    const runId = engine.submitRun({ id: "e5", source: "test", payload: {}, timestamp: new Date().toISOString() });
    await waitForRun(runStore, runId);

    const silent = runUpdates.find((r) => r.status === "silent");
    expect(silent).toBeDefined();
    expect(silent!.runId).toBe(runId);
  });

  it("emits node_update with state=silent when node stays silent", async () => {
    const { engine, runStore, events } = makeEngine(SILENT);
    const updates: NodeUpdateEvent[] = [];
    events.on("node_update", (e) => updates.push(e));

    const runId = engine.submitRun({ id: "e6", source: "test", payload: {}, timestamp: new Date().toISOString() });
    await waitForRun(runStore, runId);

    const silentNodes = updates.filter((u) => u.state === "silent");
    expect(silentNodes.length).toBeGreaterThan(0);
  });

  it("emits node_update with state=error when model throws", async () => {
    const nodeStore = new NodeStore();
    const runStore = new RunStore();
    const events = new EngineEvents();
    const modelFactory = async () => { throw new Error("LLM down"); };
    const engine = new Engine(config, modelFactory, nodeStore, runStore, "./workspace", false, events);
    engine.start();

    const updates: NodeUpdateEvent[] = [];
    events.on("node_update", (e) => updates.push(e));

    const runId = engine.submitRun({ id: "e7", source: "test", payload: {}, timestamp: new Date().toISOString() });
    await waitForRun(runStore, runId);

    const errorNodes = updates.filter((u) => u.state === "error");
    expect(errorNodes.length).toBeGreaterThan(0);
    expect(errorNodes[0].nodeId).toBeTruthy();
  });

  it("GET /events returns text/event-stream content-type", async () => {
    const { engine } = makeEngine(SILENT);
    const { createApp } = await import("../src/api/server.js");
    const nodeStore = new NodeStore();
    const runStore = new RunStore();
    nodeStore.init(["root", "leaf"]);
    const app = createApp(engine, nodeStore, runStore);

    const res = await app.request("/events");
    expect(res.headers.get("content-type")).toContain("text/event-stream");
  });
});
