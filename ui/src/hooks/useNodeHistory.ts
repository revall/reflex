import { useState, useCallback } from "react";
import { useSSE } from "./useSSE";
import { client } from "../api/client";
import type { NodeOutcome, NodeUpdateEvent, SignalFiredEvent } from "../types";

const MAX_PER_NODE = 100;

export function useNodeHistory() {
  // Map from nodeId → ordered list of outcomes (oldest first)
  const [history, setHistory] = useState<Map<string, NodeOutcome[]>>(new Map());

  const append = (nodeId: string, outcome: NodeOutcome) => {
    setHistory((prev) => {
      const next = new Map(prev);
      const existing = next.get(nodeId) ?? [];
      next.set(nodeId, [...existing, outcome].slice(-MAX_PER_NODE));
      return next;
    });
  };

  const onSignalFired = useCallback((data: unknown) => {
    const e = data as SignalFiredEvent;
    append(e.fromAgent, {
      kind: "fire",
      ts: new Date().toISOString(),
      severity: e.severity,
      summary: e.summary,
      toAgent: e.toAgent,
      payload: null, // payload not in signal_fired event; visible in NodePanel lastSignal
      trace: e.trace,
    });
  }, []);

  const onNodeUpdate = useCallback((data: unknown) => {
    const e = data as NodeUpdateEvent;
    if (e.state === "silent") {
      append(e.nodeId, { kind: "silent", ts: new Date().toISOString() });
    } else if (e.state === "error") {
      append(e.nodeId, { kind: "error", ts: new Date().toISOString(), message: null });
    }
  }, []);

  useSSE(client.eventsUrl(), { signal_fired: onSignalFired, node_update: onNodeUpdate });

  return { history };
}
