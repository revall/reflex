/**
 * Real end-to-end test — live Anthropic API, real HTTP server.
 *
 * Skipped automatically when ANTHROPIC_API_KEY is not set.
 * Run explicitly with:  npm run test:e2e:real
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { serve } from "@hono/node-server";
import { Engine } from "../src/graph/builder.js";
import { NodeStore, RunStore } from "../src/api/store.js";
import { createApp } from "../src/api/server.js";
import { createModel } from "../src/graph/model.js";
import type { NodeStatus, RunRecord, TraceEntry } from "../src/types.js";
import type { Server } from "node:http";

const HAS_KEY = !!process.env["ANTHROPIC_API_KEY"];

// ── 3-level tree: root ← middle ← leaf ───────────────────────────────────────
//
// Each agent has a narrow, unambiguous prompt so the LLM reliably fires.
// Payload describes a clear incident to avoid flaky silent decisions.

const config = {
  version: 1 as const,
  root: "root",
  agents: [
    {
      id: "root",
      prompt: `You are the executive alert agent. You receive escalated signals from your direct reports.
If the combined signals indicate a real incident, fire a critical alert with a brief executive summary.
Always fire for any incident with severity warning or above. Never stay silent for critical incidents.`,
      model: "claude-haiku-4-5-20251001",
      tools: [],
      children: ["middle"],
    },
    {
      id: "middle",
      prompt: `You are the operations manager agent. You receive raw sensor alerts from field monitors.
Assess the operational impact and always fire upward if the event indicates a real problem.
Always fire for temperature anomalies above 90 degrees.`,
      model: "claude-haiku-4-5-20251001",
      tools: [],
      children: ["leaf"],
    },
    {
      id: "leaf",
      prompt: `You are the sensor monitor agent. You receive raw sensor readings.
Extract the key facts from the event and always fire if a temperature reading exceeds 90 degrees.
Include the sensor id, temperature value, and threshold breach in your payload.`,
      model: "claude-haiku-4-5-20251001",
      tools: [],
      children: [],
    },
  ],
};

// ── helpers ───────────────────────────────────────────────────────────────────

function startServer() {
  const nodeStore = new NodeStore();
  const runStore = new RunStore();
  const engine = new Engine(config, createModel, nodeStore, runStore, "./workspace", false);
  engine.start();
  const app = createApp(engine, nodeStore, runStore);
  const server = serve({ fetch: app.fetch, port: 0 }) as Server;
  const { port } = (server.address() as { port: number });
  return { url: `http://localhost:${port}`, server, nodeStore, runStore };
}

async function pollRun(url: string, runId: string, timeoutMs = 60_000): Promise<RunRecord> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await fetch(`${url}/runs/${runId}`);
    const run = await res.json() as RunRecord;
    if (run.status !== "running") return run;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Run ${runId} did not complete within ${timeoutMs}ms`);
}

const INCIDENT_EVENT = {
  payload: {
    sensor_id: "TEMP-007",
    location: "Server Room B",
    temperature: 97,
    unit: "celsius",
    threshold: 90,
    alert_level: "high",
  },
  source: "sensor-monitor",
};

// ── tests ─────────────────────────────────────────────────────────────────────

describe.skipIf(!HAS_KEY)("Real E2E — signal propagates leaf → middle → root via live LLM", { timeout: 120_000 }, () => {
  let url: string;
  let server: Server;
  let runId: string;
  let run: RunRecord;

  beforeAll(async () => {
    ({ url, server } = startServer());

    const res = await fetch(`${url}/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(INCIDENT_EVENT),
    });
    const body = await res.json() as { runId: string };
    runId = body.runId;
    run = await pollRun(url, runId);
  });

  afterAll(() => {
    server.close();
  });

  it("run reaches a terminal state (not stuck running)", () => {
    expect(["complete", "silent"]).toContain(run.status);
  });

  it("run completes — root fired all the way up", () => {
    expect(run.status).toBe("complete");
  });

  it("root output is populated", () => {
    expect(run.rootOutput).toBeDefined();
    expect(run.rootOutput).not.toBeNull();
  });

  it("all three nodes processed the signal", async () => {
    const res = await fetch(`${url}/nodes`);
    const nodes = await res.json() as NodeStatus[];
    const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));

    expect(byId["leaf"].processedCount).toBeGreaterThan(0);
    expect(byId["middle"].processedCount).toBeGreaterThan(0);
    expect(byId["root"].processedCount).toBeGreaterThan(0);
  });

  it("root lastSignal trace has 3 entries — one per hop", async () => {
    const res = await fetch(`${url}/nodes/root`);
    const root = await res.json() as NodeStatus;
    const trace = root.lastSignal?.trace as TraceEntry[];

    expect(trace).toHaveLength(3);
    expect(trace[0].agentId).toBe("leaf");
    expect(trace[1].agentId).toBe("middle");
    expect(trace[2].agentId).toBe("root");
  });

  it("each trace entry has a non-empty summary written by the LLM", async () => {
    const res = await fetch(`${url}/nodes/root`);
    const root = await res.json() as NodeStatus;
    const trace = root.lastSignal?.trace as TraceEntry[];

    for (const entry of trace) {
      expect(entry.summary.trim().length, `[${entry.agentId}] summary is empty`).toBeGreaterThan(0);
      expect(new Date(entry.firedAt).getTime()).toBeGreaterThan(0);
    }
  });

  it("root severity is warning or critical — LLM escalated correctly", async () => {
    const res = await fetch(`${url}/nodes/root`);
    const root = await res.json() as NodeStatus;
    expect(["warning", "critical"]).toContain(root.severity);
  });

  it("leaf payload contains incident facts extracted by the LLM", async () => {
    const res = await fetch(`${url}/nodes/leaf`);
    const leaf = await res.json() as NodeStatus;
    const payload = leaf.lastSignal?.payload as Record<string, unknown>;

    expect(payload).toBeDefined();
    // LLM should have preserved or referenced the sensor and temperature
    const payloadStr = JSON.stringify(payload).toLowerCase();
    expect(payloadStr).toMatch(/temp|sensor|97|90/);
  });
});
