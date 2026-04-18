import { Link } from "react-router-dom";
import { useEngine } from "../context/EngineContext";
import { client } from "../api/client";
import type { FeedEntry, SignalFiredEvent } from "../types";

// ── helpers ──────────────────────────────────────────────────────────────────

const SEV_ORDER: Record<string, number> = { critical: 0, warning: 1, info: 2 };
const SEV_COLOUR: Record<string, string> = {
  critical: "bg-red-600 text-white",
  warning:  "bg-orange-500 text-white",
  info:     "bg-green-700 text-white",
};
const SEV_BORDER: Record<string, string> = {
  critical: "border-l-red-500",
  warning:  "border-l-orange-400",
  info:     "border-l-green-500",
};

function fmt(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// ── sub-components ────────────────────────────────────────────────────────────

function StatsBar({ nodes }: { nodes: ReturnType<typeof useEngine>["nodes"] }) {
  const all = [...nodes.values()];
  const processing = all.filter(n => n.state === "processing").length;
  const total = all.reduce((s, n) => s + n.processedCount, 0);
  const errors = all.filter(n => n.state === "error").length;

  return (
    <div className="flex items-center gap-6 text-xs text-slate-500 font-mono">
      <span>nodes <span className="text-slate-300 font-semibold">{all.length}</span></span>
      <span>·</span>
      <span>active <span className="text-blue-400 font-semibold">{processing}</span></span>
      <span>·</span>
      <span>processed <span className="text-slate-300 font-semibold">{total}</span></span>
      {errors > 0 && <><span>·</span><span>errors <span className="text-red-400 font-semibold">{errors}</span></span></>}
    </div>
  );
}

function FeedItem({ entry, onAction }: { entry: FeedEntry & { kind: "signal" }; onAction: (label: string, e: SignalFiredEvent) => void }) {
  const e = entry.event;
  const traceIds = e.trace.map(t => t.agentId);

  return (
    <div className={`border-l-4 ${SEV_BORDER[e.severity] ?? "border-l-slate-600"} bg-slate-900 rounded-r p-4 space-y-2`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${SEV_COLOUR[e.severity] ?? "bg-slate-700 text-slate-300"}`}>
            {e.severity}
          </span>
          <span className="text-slate-500 text-xs font-mono">{e.fromAgent} → {e.toAgent}</span>
        </div>
        <span className="text-slate-600 text-[10px] font-mono shrink-0">{fmt(entry.ts)}</span>
      </div>

      <p className="text-slate-100 text-sm font-medium">"{e.summary}"</p>

      {traceIds.length > 0 && (
        <div className="flex gap-1.5 flex-wrap">
          {traceIds.map((id, i) => (
            <span key={i} className="px-1.5 py-0.5 bg-slate-800 text-slate-400 rounded text-[10px] font-mono">{id}</span>
          ))}
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <button
          onClick={() => onAction("acknowledge", e)}
          className="px-3 py-1 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded text-xs font-semibold"
        >
          Acknowledge
        </button>
        <button
          onClick={() => onAction("escalate", e)}
          className="px-3 py-1 border border-slate-600 hover:border-slate-500 text-slate-400 hover:text-slate-300 rounded text-xs"
        >
          Escalate
        </button>
        <button
          onClick={() => onAction("suppress", e)}
          className="px-3 py-1 text-slate-600 hover:text-slate-400 rounded text-xs"
        >
          Suppress
        </button>
      </div>
    </div>
  );
}

// ── page ─────────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { nodes, feed } = useEngine();

  const signals = feed
    .filter((e): e is FeedEntry & { kind: "signal" } => e.kind === "signal")
    .sort((a, b) => (SEV_ORDER[a.event.severity] ?? 9) - (SEV_ORDER[b.event.severity] ?? 9));

  const runs = feed
    .filter((e): e is FeedEntry & { kind: "run" } => e.kind === "run" && e.event.status !== "running")
    .slice(0, 6);

  const handleAction = async (action: string, e: SignalFiredEvent) => {
    const payload = { action, originalSignal: { from: e.fromAgent, summary: e.summary } };
    // Inject acknowledgement/escalation into the destination node
    await client.postSignal(e.toAgent, payload, "dashboard").catch(console.error);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-mono text-sm">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <span className="text-slate-200 font-semibold uppercase tracking-widest text-xs">Spinal Cord</span>
          <span className="text-slate-700 text-xs">reflex</span>
        </div>
        <StatsBar nodes={nodes} />
        <div className="flex items-center gap-4">
          <span className="text-slate-600 text-xs">
            LAST UPDATED: {new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} UTC
          </span>
          <Link to="/" className="text-slate-500 hover:text-slate-300 text-xs">← Tree</Link>
        </div>
      </header>

      {/* Body */}
      <div className="flex gap-6 p-6 max-w-6xl mx-auto">

        {/* Ranked feed */}
        <div className="flex-1 min-w-0 space-y-3">
          <div className="flex items-center justify-between mb-4">
            <span className="text-slate-400 uppercase tracking-widest text-xs font-semibold">Ranked Feed</span>
            <span className="text-slate-600 text-xs">{signals.length} signal{signals.length !== 1 ? "s" : ""}</span>
          </div>

          {signals.length === 0 ? (
            <div className="bg-slate-900 rounded p-8 text-center text-slate-600">
              No signals yet — submit a run to start.
            </div>
          ) : (
            signals.map((entry, i) => (
              <FeedItem key={i} entry={entry} onAction={handleAction} />
            ))
          )}
        </div>

        {/* Right sidebar */}
        <div className="w-64 shrink-0 space-y-6">

          {/* Node status */}
          <div>
            <span className="text-slate-400 uppercase tracking-widest text-xs font-semibold">Nodes</span>
            <div className="mt-2 space-y-1">
              {[...nodes.values()].map(n => (
                <div key={n.id} className="flex items-center justify-between py-1.5 border-b border-slate-800">
                  <span className="text-slate-300 text-xs truncate">{n.id}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                    n.state === "processing" ? "bg-blue-900 text-blue-300" :
                    n.state === "error"      ? "bg-red-900 text-red-300" :
                    n.state === "silent"     ? "bg-yellow-900 text-yellow-300" :
                    n.severity === "critical" ? "bg-red-900 text-red-300" :
                    n.severity === "warning"  ? "bg-orange-900 text-orange-300" :
                    n.severity === "info"     ? "bg-green-900 text-green-300" :
                    "bg-slate-800 text-slate-500"
                  }`}>
                    {n.severity ?? n.state}
                  </span>
                </div>
              ))}
              {nodes.size === 0 && <p className="text-slate-600 text-xs">No nodes</p>}
            </div>
          </div>

          {/* Recently disposed */}
          <div>
            <span className="text-slate-400 uppercase tracking-widest text-xs font-semibold">Recently Disposed</span>
            <div className="mt-2 space-y-1">
              {runs.length === 0
                ? <p className="text-slate-600 text-xs">No completed runs</p>
                : runs.map((entry, i) => (
                  <div key={i} className="flex items-center justify-between py-1.5 border-b border-slate-800">
                    <span className="text-slate-500 text-xs line-through truncate">{entry.event.runId}</span>
                    <span className={`text-[10px] shrink-0 ml-2 ${
                      entry.event.status === "complete" ? "text-green-500" :
                      entry.event.status === "silent"   ? "text-yellow-500" :
                      "text-red-500"
                    }`}>
                      {entry.event.status === "complete" ? "✓" : entry.event.status === "silent" ? "–" : "✗"}
                    </span>
                  </div>
                ))
              }
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
