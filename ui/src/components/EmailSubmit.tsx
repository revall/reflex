import { useState } from "react";
import { client } from "../api/client";

export default function EmailSubmit() {
  const [from, setFrom] = useState("Jen Chen <jen.chen@rbihq.com>");
  const [subject, setSubject] = useState("FDA onion recall — supplier overlap check");
  const [body, setBody] = useState(
`VP,

Ran the FDA recall list against our Tier-2 produce vendors this morning. Taylor Farms (Colorado Springs, CO) appears as a secondary onion supplier for 14 of our Mountain West BK restaurants — activated during Q3 when our primary had a yield shortfall.

We have no confirmed product from the recalled lot. But the audit trail for Aug–Sep deliveries is thin. Requesting guidance on pull vs. hold pending lab confirmation.

— Jen`
  );
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit() {
    if (!subject.trim() && !body.trim()) return;
    setSending(true);
    try {
      await client.postSignal("agent_a", {
        type: "email",
        from: from || "user@ui",
        subject: subject || "(no subject)",
        body,
        receivedAt: new Date().toISOString(),
      }, "email-client");
      setSubject("");
      setBody("");
      setFrom("");
      setSent(true);
      setTimeout(() => setSent(false), 2000);
    } catch {
      // silent — agent_a may not exist in this config
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex items-stretch gap-2 px-3 py-2 border-t border-slate-800 bg-slate-950 shrink-0">
      <div className="flex flex-col gap-1 flex-1 min-w-0">
        <div className="flex gap-2">
          <input
            value={from}
            onChange={e => setFrom(e.target.value)}
            placeholder="From"
            className="w-36 bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs text-slate-300 placeholder-slate-600 focus:outline-none focus:border-slate-600"
          />
          <input
            value={subject}
            onChange={e => setSubject(e.target.value)}
            placeholder="Subject"
            className="flex-1 bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs text-slate-300 placeholder-slate-600 focus:outline-none focus:border-slate-600"
          />
        </div>
        <textarea
          value={body}
          onChange={e => setBody(e.target.value)}
          placeholder="Body…"
          rows={5}
          className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs text-slate-300 placeholder-slate-600 focus:outline-none focus:border-slate-600 resize-none"
        />
      </div>
      <button
        onClick={submit}
        disabled={sending || (!subject.trim() && !body.trim())}
        className="px-3 rounded text-xs font-semibold transition-all disabled:opacity-40 shrink-0"
        style={{ background: sent ? "#166534" : "#334155", color: sent ? "#bbf7d0" : "#cbd5e1" }}
      >
        {sent ? "✓ Sent" : sending ? "…" : "↑ Send"}
      </button>
    </div>
  );
}
