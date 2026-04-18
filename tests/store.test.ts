import { describe, it, expect } from "vitest";
import { NodeStore, RunStore } from "../src/api/store.js";
import type { Signal } from "../src/types.js";

function makeSignal(overrides?: Partial<Signal>): Signal {
  return {
    id: "sig_1",
    fromAgent: "leaf",
    toAgent: "root",
    severity: "warning",
    payload: { data: 1 },
    trace: [{ agentId: "leaf", summary: "fired", firedAt: new Date().toISOString() }],
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

// ── NodeStore ─────────────────────────────────────────────────────────────────

describe("NodeStore", () => {
  it("initialises all nodes as idle with zero count", () => {
    const store = new NodeStore();
    store.init(["a", "b"]);
    expect(store.get("a").state).toBe("idle");
    expect(store.get("a").processedCount).toBe(0);
    expect(store.getAll()).toHaveLength(2);
  });

  it("setProcessing transitions to processing and clears errorMessage", () => {
    const store = new NodeStore();
    store.init(["a"]);
    store.setProcessing("a");
    const s = store.get("a");
    expect(s.state).toBe("processing");
    expect(s.errorMessage).toBeNull();
  });

  it("setFired records signal, severity, and increments count", () => {
    const store = new NodeStore();
    store.init(["a"]);
    const sig = makeSignal({ severity: "critical" });
    store.setFired("a", sig);
    const s = store.get("a");
    expect(s.state).toBe("idle");
    expect(s.severity).toBe("critical");
    expect(s.lastSignal).toEqual(sig);
    expect(s.processedCount).toBe(1);
  });

  it("setSilent transitions to silent and increments count", () => {
    const store = new NodeStore();
    store.init(["a"]);
    store.setSilent("a");
    const s = store.get("a");
    expect(s.state).toBe("silent");
    expect(s.processedCount).toBe(1);
  });

  it("setError records message and increments count", () => {
    const store = new NodeStore();
    store.init(["a"]);
    store.setError("a", "something broke");
    const s = store.get("a");
    expect(s.state).toBe("error");
    expect(s.errorMessage).toBe("something broke");
    expect(s.processedCount).toBe(1);
  });

  it("processedCount accumulates across multiple signals", () => {
    const store = new NodeStore();
    store.init(["a"]);
    store.setSilent("a");
    store.setSilent("a");
    store.setFired("a", makeSignal());
    expect(store.get("a").processedCount).toBe(3);
  });

  it("throws on unknown node id", () => {
    const store = new NodeStore();
    store.init(["a"]);
    expect(() => store.get("unknown")).toThrow(/Unknown node/);
  });
});

// ── RunStore ──────────────────────────────────────────────────────────────────

describe("RunStore", () => {
  it("create returns a unique runId prefixed with run_", () => {
    const store = new RunStore();
    const id1 = store.create();
    const id2 = store.create();
    expect(id1).toMatch(/^run_/);
    expect(id2).toMatch(/^run_/);
    expect(id1).not.toBe(id2);
  });

  it("new run has status running", () => {
    const store = new RunStore();
    const id = store.create();
    expect(store.get(id)?.status).toBe("running");
  });

  it("setComplete transitions to complete and stores rootOutput", () => {
    const store = new RunStore();
    const id = store.create();
    store.setComplete(id, { result: "done" });
    const run = store.get(id)!;
    expect(run.status).toBe("complete");
    expect(run.rootOutput).toEqual({ result: "done" });
    expect(run.completedAt).not.toBeNull();
  });

  it("setSilent transitions to silent", () => {
    const store = new RunStore();
    const id = store.create();
    store.setSilent(id);
    expect(store.get(id)?.status).toBe("silent");
  });

  it("setError transitions to error", () => {
    const store = new RunStore();
    const id = store.create();
    store.setError(id);
    expect(store.get(id)?.status).toBe("error");
  });

  it("get returns undefined for unknown runId", () => {
    const store = new RunStore();
    expect(store.get("run_unknown")).toBeUndefined();
  });
});
