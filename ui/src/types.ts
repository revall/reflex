// Shared types mirrored from the engine's src/types.ts

export type NodeState = "idle" | "processing" | "silent" | "error";
export type AlertSeverity = "critical" | "warning" | "info";
export type RunStatus = "running" | "complete" | "silent" | "error";

export interface TraceEntry {
  agentId: string;
  summary: string;
  firedAt: string;
}

export interface Signal {
  id: string;
  fromAgent: string;
  toAgent: string;
  severity: AlertSeverity;
  payload: unknown;
  trace: TraceEntry[];
  timestamp: string;
}

export interface NodeStatus {
  id: string;
  state: NodeState;
  severity: AlertSeverity | null;
  lastSignalAt: string | null;
  lastSignal: Signal | null;
  errorMessage: string | null;
  processedCount: number;
}

export interface AgentConfig {
  id: string;
  prompt: string;
  model: string;
  tools: string[];
  children: string[];
}

export interface TreeConfig {
  version: number;
  root: string;
  agents: AgentConfig[];
}

export interface RunRecord {
  runId: string;
  status: RunStatus;
  startedAt: string;
  completedAt: string | null;
  rootOutput: unknown | null;
}

// SSE event payloads
export interface NodeUpdateEvent {
  nodeId: string;
  state: NodeState;
  severity: AlertSeverity | null;
  processedCount: number;
}

export interface SignalFiredEvent {
  fromAgent: string;
  toAgent: string;
  severity: AlertSeverity;
  summary: string;
  trace: TraceEntry[];
}

export interface RunUpdateEvent {
  runId: string;
  status: RunStatus;
}

export type FeedEntry =
  | { kind: "signal"; ts: string; event: SignalFiredEvent }
  | { kind: "run";    ts: string; event: RunUpdateEvent };
