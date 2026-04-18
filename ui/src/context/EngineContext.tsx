import { createContext, useContext, useEffect, useState, useCallback, useRef, type ReactNode } from "react";
import { client } from "../api/client";
import type { FeedEntry, NodeOutcome, NodeStatus, NodeUpdateEvent, RunUpdateEvent, SignalFiredEvent } from "../types";

const MAX_FEED = 200;
const MAX_HISTORY = 100;

interface EngineContextValue {
  nodes: Map<string, NodeStatus>;
  loading: boolean;
  feed: FeedEntry[];
  history: Map<string, NodeOutcome[]>;
}

const EngineContext = createContext<EngineContextValue>({
  nodes: new Map(),
  loading: true,
  feed: [],
  history: new Map(),
});

export function EngineProvider({ children }: { children: ReactNode }) {
  const [nodes, setNodes] = useState<Map<string, NodeStatus>>(new Map());
  const [loading, setLoading] = useState(true);
  const [feed, setFeed] = useState<FeedEntry[]>([]);
  const [history, setHistory] = useState<Map<string, NodeOutcome[]>>(new Map());

  // Seed nodes once
  useEffect(() => {
    client.getNodes().then((list) => {
      setNodes(new Map(list.map((n) => [n.id, n])));
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const appendFeed = (entry: FeedEntry) =>
    setFeed((prev) => [entry, ...prev].slice(0, MAX_FEED));

  const appendHistory = (nodeId: string, outcome: NodeOutcome) =>
    setHistory((prev) => {
      const next = new Map(prev);
      const existing = next.get(nodeId) ?? [];
      next.set(nodeId, [...existing, outcome].slice(-MAX_HISTORY));
      return next;
    });

  // Single persistent SSE connection for the whole app
  const esRef = useRef<EventSource | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const connect = useCallback(() => {
    const es = new EventSource(client.eventsUrl());
    esRef.current = es;

    es.addEventListener("node_update", (e) => {
      const data = JSON.parse(e.data) as NodeUpdateEvent;
      // Re-fetch full node to get lastSignal with trace
      client.getNode(data.nodeId).then((full) => {
        setNodes((prev) => { const next = new Map(prev); next.set(full.id, full); return next; });
      }).catch(() => {
        setNodes((prev) => {
          const next = new Map(prev);
          const existing = next.get(data.nodeId);
          if (existing) next.set(data.nodeId, { ...existing, state: data.state, severity: data.severity, processedCount: data.processedCount });
          return next;
        });
      });

      if (data.state === "silent") appendHistory(data.nodeId, { kind: "silent", ts: new Date().toISOString() });
      if (data.state === "error")  appendHistory(data.nodeId, { kind: "error",  ts: new Date().toISOString(), message: null });
    });

    es.addEventListener("signal_fired", (e) => {
      const data = JSON.parse(e.data) as SignalFiredEvent;
      const ts = new Date().toISOString();
      appendFeed({ kind: "signal", ts, event: data });
      appendHistory(data.fromAgent, { kind: "fire", ts, severity: data.severity, summary: data.summary, toAgent: data.toAgent, payload: null, trace: data.trace });
    });

    es.addEventListener("run_update", (e) => {
      const data = JSON.parse(e.data) as RunUpdateEvent;
      appendFeed({ kind: "run", ts: new Date().toISOString(), event: data });
    });

    es.onerror = () => {
      es.close();
      retryRef.current = setTimeout(connect, 2_000);
    };
  }, []);

  useEffect(() => {
    connect();
    return () => {
      esRef.current?.close();
      if (retryRef.current) clearTimeout(retryRef.current);
    };
  }, [connect]);

  return (
    <EngineContext.Provider value={{ nodes, loading, feed, history }}>
      {children}
    </EngineContext.Provider>
  );
}

export const useEngine = () => useContext(EngineContext);
