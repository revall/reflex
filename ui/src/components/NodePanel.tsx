import type { NodeStatus } from "../types";
import ContextView from "./ContextView";
import InjectForm from "./InjectForm";

const SEVERITY_BADGE: Record<string, string> = {
  critical: "bg-red-900 text-red-300 border border-red-700",
  warning:  "bg-orange-900 text-orange-300 border border-orange-700",
  info:     "bg-green-900 text-green-300 border border-green-700",
};

const STATE_BADGE: Record<string, string> = {
  idle:       "bg-slate-800 text-slate-400",
  processing: "bg-blue-900 text-blue-300",
  silent:     "bg-yellow-900 text-yellow-300",
  error:      "bg-red-900 text-red-300",
};

interface Props {
  nodeStatus: NodeStatus;
  onClose: () => void;
}

export default function NodePanel({ nodeStatus: n, onClose }: Props) {
  const sig = n.lastSignal;

  return (
    <div className="p-4 space-y-5 text-xs">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-sm font-semibold text-slate-100">{n.id}</h2>
          <div className="flex gap-2 mt-1">
            <span className={`px-2 py-0.5 rounded text-xs ${STATE_BADGE[n.state] ?? STATE_BADGE.idle}`}>
              {n.state}
            </span>
            {n.severity && (
              <span className={`px-2 py-0.5 rounded text-xs ${SEVERITY_BADGE[n.severity] ?? ""}`}>
                {n.severity}
              </span>
            )}
          </div>
          <p className="text-slate-500 mt-1">processed: {n.processedCount}</p>
        </div>
        <button onClick={onClose} className="text-slate-500 hover:text-slate-300 text-lg leading-none">×</button>
      </div>

      <hr className="border-slate-800" />

      {/* Last signal */}
      {sig ? (
        <div>
          <span className="text-slate-400 uppercase tracking-wide">Last Signal</span>
          <p className="mt-1 text-slate-300">
            <span className="text-slate-500">{sig.fromAgent}</span>
            {" → "}
            <span className="text-slate-500">{sig.toAgent}</span>
          </p>
          <p className="text-slate-500">{new Date(sig.timestamp).toLocaleTimeString()}</p>

          <pre className="mt-2 bg-slate-900 rounded p-2 overflow-x-auto text-slate-300 max-h-32">
            {JSON.stringify(sig.payload, null, 2)}
          </pre>

          {sig.trace.length > 0 && (
            <div className="mt-2 space-y-1">
              <span className="text-slate-500 uppercase tracking-wide">Trace</span>
              {sig.trace.map((t, i) => (
                <div key={i} className="flex gap-2 text-slate-400">
                  <span className="text-slate-600">{new Date(t.firedAt).toLocaleTimeString()}</span>
                  <span className="text-slate-300 font-semibold">{t.agentId}</span>
                  <span className="truncate">{t.summary}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <p className="text-slate-600">No signal yet</p>
      )}

      {n.errorMessage && (
        <p className="text-red-400 bg-red-950 rounded p-2">{n.errorMessage}</p>
      )}

      <hr className="border-slate-800" />
      <ContextView nodeId={n.id} />

      <hr className="border-slate-800" />
      <InjectForm nodeId={n.id} />
    </div>
  );
}
