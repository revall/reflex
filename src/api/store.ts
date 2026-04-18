import { v4 as uuidv4 } from "uuid";
import type { AlertSeverity, NodeState, NodeStatus, RunRecord, RunStatus, Signal } from "../types.js";

export class NodeStore {
  private nodes = new Map<string, NodeStatus>();

  init(ids: string[]): void {
    for (const id of ids) {
      this.nodes.set(id, {
        id,
        state: "idle",
        severity: null,
        lastSignalAt: null,
        lastSignal: null,
        errorMessage: null,
        processedCount: 0,
      });
    }
  }

  get(id: string): NodeStatus {
    const node = this.nodes.get(id);
    if (!node) throw new Error(`Unknown node: ${id}`);
    return node;
  }

  getAll(): NodeStatus[] {
    return [...this.nodes.values()];
  }

  setProcessing(id: string): void {
    this.update(id, { state: "processing", errorMessage: null });
  }

  setFired(id: string, signal: Signal): void {
    const prev = this.get(id);
    this.update(id, {
      state: "idle",
      severity: signal.severity,
      lastSignalAt: signal.timestamp,
      lastSignal: signal,
      processedCount: prev.processedCount + 1,
    });
  }

  setSilent(id: string): void {
    const prev = this.get(id);
    this.update(id, {
      state: "silent",
      processedCount: prev.processedCount + 1,
    });
  }

  setError(id: string, message: string): void {
    const prev = this.get(id);
    this.update(id, {
      state: "error",
      errorMessage: message,
      processedCount: prev.processedCount + 1,
    });
  }

  private update(id: string, patch: Partial<NodeStatus>): void {
    const current = this.get(id);
    this.nodes.set(id, { ...current, ...patch });
  }
}

export class RunStore {
  private runs = new Map<string, RunRecord>();

  create(): string {
    const runId = `run_${uuidv4().slice(0, 8)}`;
    this.runs.set(runId, {
      runId,
      status: "running",
      startedAt: new Date().toISOString(),
      completedAt: null,
      rootOutput: null,
    });
    return runId;
  }

  get(runId: string): RunRecord | undefined {
    return this.runs.get(runId);
  }

  setComplete(runId: string, rootOutput: unknown): void {
    this.finish(runId, "complete", rootOutput);
  }

  setSilent(runId: string): void {
    this.finish(runId, "silent", null);
  }

  setError(runId: string): void {
    this.finish(runId, "error", null);
  }

  private finish(runId: string, status: RunStatus, rootOutput: unknown): void {
    const run = this.runs.get(runId);
    if (!run) return;
    this.runs.set(runId, { ...run, status, completedAt: new Date().toISOString(), rootOutput });
  }
}
