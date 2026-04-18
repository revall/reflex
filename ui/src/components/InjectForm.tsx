import { useState } from "react";
import { client } from "../api/client";

interface Props {
  nodeId: string;
}

const DEFAULT = JSON.stringify({ payload: {}, source: "ui", trace: [] }, null, 2);

export default function InjectForm({ nodeId }: Props) {
  const [value, setValue] = useState(DEFAULT);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const send = async () => {
    setError(null);
    setResult(null);
    let parsed: { payload?: unknown; source?: string; trace?: unknown[] };
    try {
      parsed = JSON.parse(value) as typeof parsed;
    } catch {
      setError("Invalid JSON");
      return;
    }
    setSending(true);
    try {
      const res = await client.postSignal(nodeId, parsed.payload ?? {}, parsed.source ?? "ui", (parsed.trace ?? []) as never[]);
      setResult(`queued — depth ${res.queueDepth}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  };

  return (
    <div>
      <span className="text-xs text-slate-400 uppercase tracking-wide">Inject Signal</span>
      <textarea
        className="w-full mt-2 bg-slate-900 border border-slate-700 rounded p-2 text-xs font-mono text-slate-200 resize-none focus:outline-none focus:border-slate-500"
        rows={5}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        spellCheck={false}
      />
      <button
        onClick={send}
        disabled={sending}
        className="mt-1 px-3 py-1 bg-slate-700 hover:bg-slate-600 rounded text-xs disabled:opacity-50"
      >
        {sending ? "sending…" : "Send"}
      </button>
      {result && <p className="mt-1 text-green-400 text-xs">{result}</p>}
      {error  && <p className="mt-1 text-red-400 text-xs">{error}</p>}
    </div>
  );
}
