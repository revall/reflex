import { useState, useEffect, useCallback } from "react";
import { client } from "../api/client";
import { useSSE } from "./useSSE";
import type { NodeStatus, NodeUpdateEvent } from "../types";

export function useNodes() {
  const [nodes, setNodes] = useState<Map<string, NodeStatus>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    client.getNodes().then((list) => {
      setNodes(new Map(list.map((n) => [n.id, n])));
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const onNodeUpdate = useCallback((data: unknown) => {
    const e = data as NodeUpdateEvent;
    setNodes((prev) => {
      const next = new Map(prev);
      const existing = next.get(e.nodeId);
      if (existing) {
        next.set(e.nodeId, { ...existing, state: e.state, severity: e.severity, processedCount: e.processedCount });
      }
      return next;
    });
  }, []);

  useSSE(client.eventsUrl(), { node_update: onNodeUpdate });

  return { nodes, loading };
}
