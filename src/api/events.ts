import { EventEmitter } from "node:events";

export interface NodeUpdateEvent {
  nodeId: string;
  state: string;
  severity: string | null;
  processedCount: number;
}

export interface SignalFiredEvent {
  fromAgent: string;
  toAgent: string;
  severity: string;
  summary: string;
  trace: Array<{ agentId: string; summary: string; firedAt: string }>;
}

export interface RunUpdateEvent {
  runId: string;
  status: string;
}

export type EngineEventMap = {
  node_update: [NodeUpdateEvent];
  signal_fired: [SignalFiredEvent];
  run_update: [RunUpdateEvent];
};

export class EngineEvents extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(100);
  }

  emitNodeUpdate(data: NodeUpdateEvent): void {
    this.emit("node_update", data);
  }

  emitSignalFired(data: SignalFiredEvent): void {
    this.emit("signal_fired", data);
  }

  emitRunUpdate(data: RunUpdateEvent): void {
    this.emit("run_update", data);
  }
}
