import { useState } from "react";
import { client } from "../api/client";

const DEFAULT_PAYLOAD = JSON.stringify({ type: "event", data: {} }, null, 2);

export default function RunModal() {
  const [open, setOpen] = useState(false);
  const [payload, setPayload] = useState(DEFAULT_PAYLOAD);
  const [source, setSource] = useState("ui");
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const submit = async () => {
    setError(null);
    setResult(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(payload);
    } catch {
      setError("Invalid JSON payload");
      return;
    }
    setRunning(true);
    try {
      const res = await client.postRun(parsed, source);
      setResult(`Run started: ${res.runId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  };

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-44 right-4 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded text-sm font-semibold shadow-lg z-10"
      >
        ▶ Run
      </button>

      {/* Modal */}
      {open && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-20">
          <div className="bg-slate-900 border border-slate-700 rounded-lg p-5 w-96 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-100">Submit Run</h3>
              <button onClick={() => { setOpen(false); setResult(null); setError(null); }}
                className="text-slate-500 hover:text-slate-300 text-lg leading-none">×</button>
            </div>

            <div>
              <label className="text-xs text-slate-400">Source</label>
              <input
                value={source}
                onChange={(e) => setSource(e.target.value)}
                className="w-full mt-1 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-slate-500"
              />
            </div>

            <div>
              <label className="text-xs text-slate-400">Payload (JSON)</label>
              <textarea
                rows={7}
                value={payload}
                onChange={(e) => setPayload(e.target.value)}
                className="w-full mt-1 bg-slate-800 border border-slate-700 rounded p-2 text-xs font-mono text-slate-200 resize-none focus:outline-none focus:border-slate-500"
                spellCheck={false}
              />
            </div>

            {result && <p className="text-green-400 text-xs">{result}</p>}
            {error  && <p className="text-red-400 text-xs">{error}</p>}

            <button
              onClick={submit}
              disabled={running}
              className="w-full py-2 bg-slate-700 hover:bg-slate-600 rounded text-sm font-semibold disabled:opacity-50"
            >
              {running ? "Submitting…" : "Submit"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
