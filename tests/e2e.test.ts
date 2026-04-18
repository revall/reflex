/**
 * End-to-end test: real HTTP server on a random port, real fetch calls.
 * Uses FakeListChatModel so no API key is needed.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { serve } from "@hono/node-server";
import { FakeListChatModel } from "@langchain/core/utils/testing";
import { Engine } from "../src/graph/builder.js";
import { NodeStore, RunStore } from "../src/api/store.js";
import { createApp } from "../src/api/server.js";
import type { RunRecord, NodeStatus } from "../src/types.js";
import type { Server } from "node:http";

// ── tree: root ← [leaf_a, leaf_b] ───────────────────────────────────────────

const FIRE = '{"action":"fire","severity":"warning","summary":"anomaly detected","payload":{"score":0.9}}';
const SILENT = '{"action":"silent"}';

function makeServer(leafResponse: string, rootResponse = FIRE): { url: string; server: Server } {
  const nodeStore = new NodeStore();
  const runStore = new RunStore();
  const modelFactory = async () =>
    new FakeListChatModel({ responses: [leafResponse, leafResponse, rootResponse, rootResponse] });

  const config = {
    version: 1 as const,
    root: "root",
    agents: [
      { id: "root",   prompt: "synthesize", model: "claude-sonnet-4-6", tools: [], children: ["leaf_a", "leaf_b"] },
      { id: "leaf_a", prompt: "analyze-a",  model: "claude-sonnet-4-6", tools: [], children: [] },
      { id: "leaf_b", prompt: "analyze-b",  model: "claude-sonnet-4-6", tools: [], children: [] },
    ],
  };

  const engine = new Engine(config, modelFactory, nodeStore, runStore, "./workspace", false);
  engine.start();

  const app = createApp(engine, nodeStore, runStore);
  // Port 0 lets the OS pick a free port
  const server = serve({ fetch: app.fetch, port: 0 }) as Server;
  const { port } = server.address() as { port: number };
  return { url: `http://localhost:${port}`, server };
}

async function pollRun(url: string, runId: string, timeoutMs = 5000): Promise<RunRecord> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await fetch(`${url}/runs/${runId}`);
    const run = await res.json() as RunRecord;
    if (run.status !== "running") return run;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`Run ${runId} did not complete within ${timeoutMs}ms`);
}

// ── tests ────────────────────────────────────────────────────────────────────

describe("E2E — full tree via HTTP", () => {
  let url: string;
  let server: Server;

  beforeAll(() => {
    ({ url, server } = makeServer(FIRE));
  });

  afterAll(() => {
    server.close();
  });

  it("GET /config returns the loaded tree", async () => {
    const res = await fetch(`${url}/config`);
    expect(res.status).toBe(200);
    const body = await res.json() as { root: string; agents: unknown[] };
    expect(body.root).toBe("root");
    expect(body.agents).toHaveLength(3);
  });

  it("GET /nodes returns all agents as idle initially", async () => {
    const res = await fetch(`${url}/nodes`);
    expect(res.status).toBe(200);
    const nodes = await res.json() as NodeStatus[];
    expect(nodes).toHaveLength(3);
    expect(nodes.every((n) => n.state === "idle")).toBe(true);
  });

  it("POST /run → run completes with root firing", async () => {
    const res = await fetch(`${url}/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payload: { incident: "disk full", host: "srv-01" }, source: "monitor" }),
    });
    expect(res.status).toBe(200);

    const { runId, startedAt } = await res.json() as { runId: string; startedAt: string };
    expect(runId).toMatch(/^run_/);
    expect(startedAt).toBeTruthy();

    const run = await pollRun(url, runId);
    expect(run.status).toBe("complete");
    expect(run.completedAt).toBeTruthy();
    expect(run.rootOutput).toBeDefined();
  });

  it("GET /nodes shows leaf and root fired after run", async () => {
    // Submit a second run and wait for it
    const res = await fetch(`${url}/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payload: { check: "second" }, source: "test" }),
    });
    const { runId } = await res.json() as { runId: string };
    await pollRun(url, runId);

    const nodesRes = await fetch(`${url}/nodes`);
    const nodes = await nodesRes.json() as NodeStatus[];
    const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));

    expect(byId["leaf_a"].processedCount).toBeGreaterThan(0);
    expect(byId["leaf_b"].processedCount).toBeGreaterThan(0);
    expect(byId["root"].processedCount).toBeGreaterThan(0);
    expect(byId["root"].severity).toBe("warning");
  });

  it("signal trace propagates from leaf through root", async () => {
    const res = await fetch(`${url}/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payload: { incident: "cpu spike", host: "srv-02" }, source: "monitor" }),
    });
    const { runId } = await res.json() as { runId: string };
    await pollRun(url, runId);

    // Inspect the last signal received by root via GET /nodes/root
    const nodeRes = await fetch(`${url}/nodes/root`);
    expect(nodeRes.status).toBe(200);
    const root = await nodeRes.json() as NodeStatus;

    const trace = root.lastSignal?.trace as Array<{ agentId: string; summary: string; firedAt: string }>;
    expect(trace).toBeDefined();
    expect(trace.length).toBeGreaterThanOrEqual(2); // leaf + root

    // Leaf entry must appear before root entry
    const leafIdx = trace.findIndex((t) => t.agentId === "leaf_a" || t.agentId === "leaf_b");
    const rootIdx = trace.findIndex((t) => t.agentId === "root");
    expect(leafIdx).toBeGreaterThanOrEqual(0);
    expect(rootIdx).toBeGreaterThan(leafIdx);

    // Every entry must have the required fields
    for (const entry of trace) {
      expect(entry.agentId).toBeTruthy();
      expect(entry.summary).toBeTruthy();
      expect(new Date(entry.firedAt).getTime()).toBeGreaterThan(0);
    }

    // Root's summary must match what the model returned
    expect(trace[rootIdx].summary).toBe("anomaly detected");
  });

  it("GET /runs/:runId returns 404 for unknown id", async () => {
    const res = await fetch(`${url}/runs/run_does_not_exist`);
    expect(res.status).toBe(404);
  });
});

describe("E2E — silent run", () => {
  let url: string;
  let server: Server;

  beforeAll(() => {
    ({ url, server } = makeServer(SILENT));
  });

  afterAll(() => {
    server.close();
  });

  it("run is silent when all leaves stay silent", async () => {
    const res = await fetch(`${url}/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payload: { noise: true }, source: "test" }),
    });
    const { runId } = await res.json() as { runId: string };
    const run = await pollRun(url, runId);
    expect(run.status).toBe("silent");
  });
});

describe("E2E — direct node injection", () => {
  let url: string;
  let server: Server;

  beforeAll(() => {
    ({ url, server } = makeServer(FIRE));
  });

  afterAll(() => {
    server.close();
  });

  it("POST /nodes/:id/signal queues to a specific node", async () => {
    const res = await fetch(`${url}/nodes/leaf_a/signal`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payload: { direct: true }, source: "test" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { queued: boolean; nodeId: string };
    expect(body.queued).toBe(true);
    expect(body.nodeId).toBe("leaf_a");
  });

  it("GET /doc serves Swagger UI", async () => {
    const res = await fetch(`${url}/doc`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/html/);
  });

  it("GET /openapi.json serves valid OpenAPI schema", async () => {
    const res = await fetch(`${url}/openapi.json`);
    expect(res.status).toBe(200);
    const schema = await res.json() as { openapi: string; info: { title: string } };
    expect(schema.openapi).toBe("3.0.0");
    expect(schema.info.title).toBe("Neuron Agent Engine");
  });
});
