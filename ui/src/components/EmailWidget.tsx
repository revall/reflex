import { useState } from "react";
import { client } from "../api/client";

interface Email {
  id: string;
  initials: string;
  from: string;
  role: string;
  to: string;
  cc?: string;
  subject: string;
  age: string;
  body: string[];
  tag: string;
  targetNode: string;
}

const EMAILS: Email[] = [
  {
    id: "1",
    initials: "JC",
    from: "Jen Chen",
    role: "Supply Chain Risk · RBI HQ",
    to: "vp.procurement@rbihq.com",
    cc: "s.patel@rbihq.com",
    subject: "FDA onion recall — supplier overlap check",
    age: "2m ago",
    tag: "SUPPLY CHAIN",
    targetNode: "agent_a",
    body: [
      "VP,",
      "Ran the FDA recall list against our Tier-2 produce vendors this morning. Taylor Farms (Colorado Springs, CO) appears as a secondary onion supplier for 14 of our Mountain West BK restaurants — activated during Q3 when our primary had a yield shortfall.",
      "We have no confirmed product from the recalled lot. But the audit trail for Aug–Sep deliveries is thin. Requesting guidance on pull vs. hold pending lab confirmation.",
      "— Jen",
    ],
  },
  {
    id: "2",
    initials: "MB",
    from: "Marcus Bell",
    role: "Franchise Legal · RBI HQ",
    to: "ceo@rbihq.com",
    cc: "coo@rbihq.com",
    subject: "Premier Kings Ch. 11 — board notification required",
    age: "14m ago",
    tag: "FRANCHISE",
    targetNode: "agent_a",
    body: [
      "Joshua,",
      "Premier Kings filed for Chapter 11 this morning in District of Delaware. 437 locations, $380M annualised sales. Our franchise agreement requires board notification within 24h of material franchisee insolvency.",
      "Recommend we convene an emergency call by EOD. I can have the transition framework ready by 3pm.",
      "— Marcus",
    ],
  },
  {
    id: "3",
    initials: "AK",
    from: "Aisha Khan",
    role: "QA Operations · RBI HQ",
    to: "ops.leadership@rbihq.com",
    subject: "Allergen label miss — batch 2024-Q4 buns",
    age: "1h ago",
    tag: "OPERATIONS",
    targetNode: "agent_a",
    body: [
      "Team,",
      "QA audit flagged missing sesame declaration on batch 2024-Q4 sesame buns shipped to Atlanta, Dallas, and Chicago DCs. Estimated 2.3M units. FDA labeling violation.",
      "Pulling product from shelves in affected markets pending legal review. Full incident report by noon.",
      "— Aisha",
    ],
  },
];

export default function EmailWidget() {
  const [selected, setSelected] = useState<Email | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  async function inject(email: Email) {
    setSending(true);
    setError(null);
    try {
      await client.postSignal(email.targetNode, {
        type: "email",
        from: email.from,
        role: email.role,
        to: email.to,
        cc: email.cc,
        subject: email.subject,
        body: email.body.join("\n\n"),
        tag: email.tag,
        receivedAt: new Date().toISOString(),
      }, "email-client");
      setSent(prev => new Set([...prev, email.id]));
      setSelected(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ background: "var(--surface-low)" }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b shrink-0"
        style={{ borderColor: "var(--outline-variant)", background: "var(--surface-lowest)" }}>
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined" style={{ fontSize: 16, color: "var(--outline)" }}>mail</span>
          <span className="font-mono text-[10px] font-bold tracking-widest uppercase" style={{ color: "var(--on-surface)" }}>
            Inbox
          </span>
          <span className="font-mono text-[9px] px-1.5 py-0.5 rounded-full"
            style={{ background: "var(--error)", color: "#fff" }}>
            {EMAILS.filter(e => !sent.has(e.id)).length}
          </span>
        </div>
        {selected
          ? <button onClick={() => { setSelected(null); setError(null); }}
              className="font-body text-xs flex items-center gap-1 transition-colors"
              style={{ color: "var(--outline)" }}>
              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>arrow_back</span>
              Back
            </button>
          : <span className="font-mono text-[9px]" style={{ color: "var(--outline)" }}>→ agent_a</span>
        }
      </div>

      {selected ? (
        /* ── Email detail ── */
        <div className="flex flex-col flex-1 overflow-y-auto p-4 space-y-4">
          <article className="rounded-lg premium-shadow ghost-border inner-highlight p-4 relative"
            style={{ background: "var(--surface-lowest)" }}>

            {/* Sender row */}
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 rounded-full flex items-center justify-center font-body text-xs font-bold"
                  style={{ background: "var(--primary)", color: "var(--on-primary)" }}>
                  {selected.initials}
                </div>
                <div className="flex flex-col leading-tight">
                  <span className="font-body text-sm font-medium" style={{ color: "var(--on-surface)" }}>{selected.from}</span>
                  <span className="font-body text-[10px]" style={{ color: "var(--outline)" }}>{selected.role}</span>
                </div>
              </div>
              <span className="font-mono text-[9px]" style={{ color: "var(--outline)" }}>{selected.age}</span>
            </div>

            {/* To/CC */}
            <div className="flex flex-col space-y-0.5 mb-3 font-body text-[10.5px]" style={{ color: "var(--secondary)" }}>
              <span><span style={{ color: "var(--outline)" }}>to:</span> {selected.to}</span>
              {selected.cc && <span><span style={{ color: "var(--outline)" }}>cc:</span> {selected.cc}</span>}
            </div>

            {/* Subject */}
            <p className="font-body text-sm font-bold mb-2 leading-snug" style={{ color: "var(--on-surface)" }}>
              {selected.subject}
            </p>

            {/* Body */}
            <div className="font-body text-[11.5px] leading-snug space-y-2" style={{ color: "var(--on-surface-variant)" }}>
              {selected.body.map((p, i) => (
                <p key={i} style={i === selected.body.length - 1 ? { color: "var(--outline)" } : {}}>{p}</p>
              ))}
            </div>
          </article>

          {error && <p className="text-xs" style={{ color: "var(--error)" }}>{error}</p>}

          <button onClick={() => inject(selected)} disabled={sending}
            className="w-full py-2 font-body text-sm font-medium rounded transition-all active:scale-95 disabled:opacity-50 inner-highlight"
            style={{ background: `linear-gradient(135deg, var(--primary), var(--primary-container))`, color: "var(--on-primary)", boxShadow: "0 2px 8px -2px rgba(68,80,183,0.4)" }}>
            {sending ? "Injecting…" : `↑ Forward to ${selected.targetNode}`}
          </button>
        </div>
      ) : (
        /* ── Inbox list ── */
        <ul className="flex flex-col overflow-y-auto divide-y" style={{ borderColor: "var(--outline-variant)" }}>
          {EMAILS.map(email => {
            const done = sent.has(email.id);
            return (
              <li key={email.id}
                onClick={() => !done && setSelected(email)}
                className={`px-4 py-3 flex flex-col gap-1 transition-colors ${done ? "opacity-40" : "cursor-pointer"}`}
                onMouseEnter={e => { if (!done) e.currentTarget.style.background = "var(--surface-container-low)"; }}
                onMouseLeave={e => { e.currentTarget.style.background = ""; }}>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-6 h-6 rounded-full shrink-0 flex items-center justify-center font-body text-[9px] font-bold"
                      style={{ background: done ? "var(--outline-variant)" : "var(--primary)", color: done ? "var(--outline)" : "var(--on-primary)" }}>
                      {email.initials}
                    </div>
                    <div className="min-w-0">
                      <span className="font-body text-xs font-semibold block" style={{ color: "var(--on-surface)" }}>{email.from}</span>
                      <span className="font-body text-[10px] truncate block" style={{ color: "var(--outline)" }}>{email.role}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {done
                      ? <span className="material-symbols-outlined" style={{ fontSize: 14, color: "var(--outline)" }}>check_circle</span>
                      : <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--primary)" }} />
                    }
                    <span className="font-mono text-[9px]" style={{ color: "var(--outline)" }}>{email.age}</span>
                  </div>
                </div>
                <p className="font-body text-xs font-medium truncate" style={{ color: "var(--on-surface)" }}>{email.subject}</p>
                <span className="font-mono text-[9px] self-start px-1.5 py-0.5 rounded"
                  style={{ background: "var(--surface-container)", color: "var(--secondary)", border: "1px solid var(--outline-variant)" }}>
                  {email.tag}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
