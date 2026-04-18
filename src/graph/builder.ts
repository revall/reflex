import fs from "node:fs";
import path from "node:path";
import { v4 as uuidv4 } from "uuid";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { AgentConfig, RawEvent, Signal, TraceEntry, TreeConfig } from "../types.js";
import { processSignal } from "./node.js";
import { buildTools } from "../tools/index.js";
import type { NodeStore, RunStore } from "../api/store.js";

interface QueueItem {
  signal: RawEvent | Signal;
  runId: string;
}

export class Engine {
  private agentMap: Map<string, AgentConfig>;
  private leafIds: string[];
  private rootId: string;
  private queues = new Map<string, QueueItem[]>();
  private tail = new Map<string, Promise<void>>();
  private nodeContexts = new Map<string, Map<string, string>>();
  // Counts signals in-flight per run. Incremented at enqueue, decremented only
  // at terminal outcomes (silent, error, root fires). Hits 0 → run is silent.
  private runPending = new Map<string, number>();

  constructor(
    private config: TreeConfig,
    private modelFactory: (modelId: string) => Promise<BaseChatModel>,
    private nodeStore: NodeStore,
    private runStore: RunStore,
    private workdir: string
  ) {
    this.agentMap = new Map(config.agents.map((a) => [a.id, a]));
    this.leafIds = config.agents.filter((a) => a.children.length === 0).map((a) => a.id);
    this.rootId = config.root;

    for (const agent of config.agents) {
      this.queues.set(agent.id, []);
      this.tail.set(agent.id, Promise.resolve());
      this.nodeContexts.set(agent.id, new Map());
    }
  }

  start(): void {
    this.nodeStore.init([...this.agentMap.keys()]);
  }

  submitRun(event: RawEvent): string {
    const runId = this.runStore.create();
    for (const leafId of this.leafIds) {
      this.enqueue(leafId, { signal: event, runId });
    }
    return runId;
  }

  submitToNode(
    nodeId: string,
    payload: unknown,
    source: string,
    trace: TraceEntry[]
  ): { queueDepth: number } {
    const agentCfg = this.agentMap.get(nodeId);
    if (!agentCfg) throw new Error(`Unknown node: ${nodeId}`);

    // If caller supplies a trace, wrap as a Signal so the trace is preserved.
    // Otherwise use a plain RawEvent.
    const signal: RawEvent | Signal =
      trace.length > 0
        ? {
            id: uuidv4(),
            fromAgent: source,
            toAgent: nodeId,
            severity: "info",
            payload,
            trace,
            timestamp: new Date().toISOString(),
          }
        : {
            id: uuidv4(),
            source,
            payload,
            timestamp: new Date().toISOString(),
          };

    const runId = this.runStore.create();
    this.enqueue(nodeId, { signal, runId });
    // Queue length is stable here — enqueue appends synchronously before any await.
    const depth = this.queues.get(nodeId)?.length ?? 0;
    return { queueDepth: depth };
  }

  getConfig(): TreeConfig {
    return this.config;
  }

  getQueueDepth(nodeId: string): number {
    return this.queues.get(nodeId)?.length ?? 0;
  }

  getNodeContext(nodeId: string): Map<string, string> {
    return this.nodeContexts.get(nodeId) ?? new Map();
  }

  clearNodeContext(nodeId: string): void {
    this.nodeContexts.get(nodeId)?.clear();
  }

  private enqueue(nodeId: string, item: QueueItem): void {
    const queue = this.queues.get(nodeId);
    if (!queue) return;
    queue.push(item);
    // Increment pending count here — before any processing begins — so the
    // counter is always non-zero while a signal is in-flight.
    const current = this.runPending.get(item.runId) ?? 0;
    this.runPending.set(item.runId, current + 1);

    const prev = this.tail.get(nodeId) ?? Promise.resolve();
    const next = prev.then(() => this.drainOne(nodeId));
    this.tail.set(nodeId, next);
  }

  private async drainOne(nodeId: string): Promise<void> {
    const queue = this.queues.get(nodeId);
    if (!queue || queue.length === 0) return;
    const item = queue.shift()!;
    await this.handleSignal(nodeId, item);
  }

  private decrement(runId: string): void {
    const pending = (this.runPending.get(runId) ?? 0) - 1;
    if (pending <= 0) {
      this.runPending.delete(runId);
      const run = this.runStore.get(runId);
      if (run?.status === "running") {
        this.runStore.setSilent(runId);
      }
    } else {
      this.runPending.set(runId, pending);
    }
  }

  private async handleSignal(nodeId: string, item: QueueItem): Promise<void> {
    const { signal, runId } = item;
    const agentCfg = this.agentMap.get(nodeId)!;
    this.nodeStore.setProcessing(nodeId);

    try {
      const model = await this.modelFactory(agentCfg.model);
      const nodeContext = this.nodeContexts.get(nodeId)!;
      const tools = buildTools(agentCfg.tools, { workdir: this.workdir, nodeContext });
      const decision = await processSignal(signal, agentCfg, { model, tools });

      const incomingTrace: TraceEntry[] = "trace" in signal ? (signal as Signal).trace : [];

      if (decision.action === "fire") {
        const trace: TraceEntry[] = [
          ...incomingTrace,
          { agentId: nodeId, summary: decision.summary, firedAt: new Date().toISOString() },
        ];

        const parentId = this.findParent(nodeId);
        const outSignal: Signal = {
          id: uuidv4(),
          fromAgent: nodeId,
          toAgent: parentId ?? "output",
          severity: decision.severity,
          payload: decision.payload,
          trace,
          timestamp: new Date().toISOString(),
        };

        this.nodeStore.setFired(nodeId, outSignal);
        this.writeTraceLog(runId, nodeId, signal, outSignal, true);

        if (parentId) {
          // Enqueue to parent first (increments pending), then decrement for
          // this node. Order matters: prevents pending from hitting 0 between
          // the two operations when this is the last in-flight signal.
          this.enqueue(parentId, { signal: outSignal, runId });
          this.decrement(runId);
        } else {
          // Root fired — mark complete and clean up pending tracking.
          process.stdout.write(JSON.stringify(outSignal, null, 2) + "\n");
          this.runStore.setComplete(runId, outSignal.payload);
          this.runPending.delete(runId);
        }
      } else {
        this.nodeStore.setSilent(nodeId);
        this.writeTraceLog(runId, nodeId, signal, null, false);
        this.decrement(runId);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.nodeStore.setError(nodeId, message);
      process.stderr.write(`[${nodeId}] error: ${message}\n`);
      this.decrement(runId);
    }
  }

  private findParent(nodeId: string): string | null {
    for (const agent of this.agentMap.values()) {
      if (agent.children.includes(nodeId)) return agent.id;
    }
    return null;
  }

  private writeTraceLog(
    runId: string,
    agentId: string,
    input: RawEvent | Signal,
    output: Signal | null,
    fired: boolean
  ): void {
    try {
      fs.mkdirSync("./logs", { recursive: true });
      const entry = JSON.stringify({ agentId, fired, input, output, timestamp: new Date().toISOString() });
      fs.appendFileSync(path.join("./logs", `trace-${runId}.jsonl`), entry + "\n");
    } catch {
      // Non-fatal — trace log failure must not crash the engine
    }
  }
}
