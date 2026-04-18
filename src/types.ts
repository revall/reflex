export interface RawEvent {
  id: string;
  source: string;
  payload: unknown;
  timestamp: string;
}

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

export type NodeState = "idle" | "processing" | "silent" | "error";
export type AlertSeverity = "critical" | "warning" | "info";

export interface NodeStatus {
  id: string;
  state: NodeState;
  severity: AlertSeverity | null;
  lastSignalAt: string | null;
  lastSignal: Signal | null;
  errorMessage: string | null;
  processedCount: number;
}

export type LLMDecision =
  | { action: "fire"; severity: AlertSeverity; summary: string; payload: unknown }
  | { action: "silent" };

export type RunStatus = "running" | "complete" | "silent" | "error";

export interface RunRecord {
  runId: string;
  status: RunStatus;
  startedAt: string;
  completedAt: string | null;
  rootOutput: unknown | null;
}
