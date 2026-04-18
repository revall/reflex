import { describe, it, expect } from "vitest";
import { FakeListChatModel } from "@langchain/core/utils/testing";
import { Engine } from "../src/graph/builder.js";
import { NodeStore, RunStore } from "../src/api/store.js";
import { createApp } from "../src/api/server.js";
import type { TreeConfig } from "../src/types.js";

const config: TreeConfig = {
  version: 1,
  root: "root",
  agents: [
    { id: "root", prompt: "synthesize", model: "claude-sonnet-4-6", tools: [], children: ["leaf"] },
    { id: "leaf", prompt: "analyze", model: "claude-sonnet-4-6", tools: [], children: [] },
  ],
};

function makeApp(response = '{"action":"silent"}', debug = false) {
  const nodeStore = new NodeStore();
  const runStore = new RunStore();
  const modelFactory = async () =>
    new FakeListChatModel({ responses: [response, response] });
  const engine = new Engine(config, modelFactory, nodeStore, runStore, "./workspace", debug);
  engine.start();
  return { app: createApp(engine, nodeStore, runStore), nodeStore, runStore, engine };
}

describe("GET /config", () => {
  it("returns the loaded tree config", async () => {
    const { app } = makeApp();
    const res = await app.request("/config");
    expect(res.status).toBe(200);
    const body = await res.json() as typeof config;
    expect(body.root).toBe("root");
    expect(body.agents).toHaveLength(2);
  });
});

describe("GET /nodes", () => {
  it("returns all node statuses", async () => {
    const { app } = makeApp();
    const res = await app.request("/nodes");
    expect(res.status).toBe(200);
    const body = await res.json() as Array<{ id: string; state: string }>;
    expect(body).toHaveLength(2);
    expect(body.map((n) => n.id).sort()).toEqual(["leaf", "root"]);
    expect(body[0].state).toBe("idle");
  });
});

describe("GET /nodes/:id", () => {
  it("returns a single node status", async () => {
    const { app } = makeApp();
    const res = await app.request("/nodes/leaf");
    expect(res.status).toBe(200);
    const body = await res.json() as { id: string };
    expect(body.id).toBe("leaf");
  });

  it("returns 404 for unknown node", async () => {
    const { app } = makeApp();
    const res = await app.request("/nodes/nonexistent");
    expect(res.status).toBe(404);
  });
});

describe("POST /run", () => {
  it("returns runId with running status and consistent startedAt", async () => {
    const { app, runStore } = makeApp();
    const res = await app.request("/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payload: { test: true }, source: "test" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { runId: string; status: string; startedAt: string };
    expect(body.runId).toMatch(/^run_/);
    expect(body.status).toBe("running");
    // startedAt must match what is stored in RunStore
    expect(body.startedAt).toBe(runStore.get(body.runId)?.startedAt);
  });
});

describe("GET /runs/:runId", () => {
  it("returns the run record", async () => {
    const { app, runStore } = makeApp();
    const runId = runStore.create();
    const res = await app.request(`/runs/${runId}`);
    expect(res.status).toBe(200);
    const body = await res.json() as { runId: string; status: string };
    expect(body.runId).toBe(runId);
    expect(body.status).toBe("running");
  });

  it("returns 404 for unknown runId", async () => {
    const { app } = makeApp();
    const res = await app.request("/runs/run_unknown");
    expect(res.status).toBe(404);
  });
});

describe("POST /nodes/:id/signal", () => {
  it("queues a signal and returns queueDepth", async () => {
    const { app } = makeApp();
    const res = await app.request("/nodes/leaf/signal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payload: { event: "test" }, source: "test" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { queued: boolean; nodeId: string; queueDepth: number };
    expect(body.queued).toBe(true);
    expect(body.nodeId).toBe("leaf");
    expect(typeof body.queueDepth).toBe("number");
  });

  it("returns 404 for unknown node", async () => {
    const { app } = makeApp();
    const res = await app.request("/nodes/ghost/signal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payload: {}, source: "test" }),
    });
    expect(res.status).toBe(404);
  });

  it("preserves supplied trace in queued signal", async () => {
    const { app, nodeStore } = makeApp('{"action":"fire","severity":"info","summary":"ok","payload":{}}', false);
    const trace = [{ agentId: "upstream", summary: "upstream fired", firedAt: new Date().toISOString() }];

    await app.request("/nodes/leaf/signal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payload: { x: 1 }, source: "test", trace }),
    });

    // Wait for leaf to process
    await new Promise<void>((resolve) => {
      const check = () => {
        if (nodeStore.get("leaf").processedCount > 0) return resolve();
        setTimeout(check, 50);
      };
      check();
    });

    // leaf fired — its outgoing signal trace should include the upstream entry
    const lastSignal = nodeStore.get("leaf").lastSignal;
    expect(lastSignal?.trace.some((t) => t.agentId === "upstream")).toBe(true);
  });
});

describe("GET /nodes/:id/context and DELETE /nodes/:id/context", () => {
  it("returns empty context initially", async () => {
    const { app } = makeApp();
    const res = await app.request("/nodes/leaf/context");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
  });

  it("clears context", async () => {
    const { app, engine } = makeApp();
    engine.getNodeContext("leaf").set("k", "v");
    const delRes = await app.request("/nodes/leaf/context", { method: "DELETE" });
    expect(delRes.status).toBe(200);
    const getRes = await app.request("/nodes/leaf/context");
    expect(await getRes.json()).toEqual({});
  });
});
