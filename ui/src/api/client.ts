import type { NodeStatus, RunRecord, TreeConfig, TraceEntry } from "../types";

const BASE = import.meta.env["VITE_ENGINE_URL"] ?? "http://localhost:3000";

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST ${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

async function del<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`DELETE ${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

export const client = {
  getConfig: () => get<TreeConfig>("/config"),
  getNodes:  () => get<NodeStatus[]>("/nodes"),
  getNode:   (id: string) => get<NodeStatus>(`/nodes/${id}`),

  postRun: (payload: unknown, source = "ui") =>
    post<{ runId: string; status: string; startedAt: string }>("/run", { payload, source }),

  getRun: (runId: string) => get<RunRecord>(`/runs/${runId}`),

  postSignal: (nodeId: string, payload: unknown, source = "ui", trace: TraceEntry[] = []) =>
    post<{ queued: boolean; nodeId: string; queueDepth: number }>(
      `/nodes/${nodeId}/signal`,
      { payload, source, trace }
    ),

  getContext:   (nodeId: string) => get<Record<string, string>>(`/nodes/${nodeId}/context`),
  clearContext: (nodeId: string) => del<{ cleared: boolean; nodeId: string }>(`/nodes/${nodeId}/context`),

  eventsUrl: () => `${BASE}/events`,
};
