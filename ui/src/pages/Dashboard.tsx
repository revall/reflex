import { useState } from "react";
import { Link } from "react-router-dom";
import { useEngine } from "../context/EngineContext";
import { client } from "../api/client";
import type { FeedEntry, AlertSeverity, SignalFiredEvent } from "../types";

// ── mock feed items (from design file) ───────────────────────────────────────

interface MockEntry {
  kind: "mock";
  ts: string;
  event: {
    fromAgent: string;
    toAgent:   string;
    severity:  AlertSeverity;
    summary:   string;
    trace:     { agentId: string; summary: string; firedAt: string }[];
  };
}

const MOCK_FEED: MockEntry[] = [
  {
    kind: "mock", ts: "",
    event: {
      fromAgent: "S5 GOVERNANCE", toAgent: "board", severity: "critical",
      summary: "Allergen-labeling miss at regional bun supplier; 3 markets affected",
      trace: [],
    },
  },
  {
    kind: "mock", ts: "",
    event: {
      fromAgent: "S2 OPERATIONS", toAgent: "coo", severity: "warning",
      summary: "SSSG softening in mid-market US franchisee cohort…",
      trace: [],
    },
  },
  {
    kind: "mock", ts: "",
    event: {
      fromAgent: "S4 MARKET", toAgent: "cmo", severity: "info",
      summary: "Competitor announces national $5 value-meal extension…",
      trace: [],
    },
  },
];

// ── severity helpers ──────────────────────────────────────────────────────────

const SEV_ORDER: Record<string, number> = { critical: 0, warning: 1, info: 2 };

const SEV_BORDER: Record<string, string> = {
  critical: "bg-[var(--error)]",
  warning:  "bg-[var(--amber-caution)]",
  info:     "bg-[var(--outline)]",
};

const SEV_LABEL: Record<string, string> = {
  critical: "text-[var(--error)] font-bold tracking-tight",
  warning:  "text-[var(--amber-caution)] font-semibold",
  info:     "text-[var(--outline)]",
};

const SEV_DOT: Record<string, string> = {
  critical: "bg-[var(--error)]",
  warning:  "bg-[var(--amber-caution)]",
  info:     "bg-[var(--outline)]",
};

const SEV_URGENCY: Record<string, string> = {
  critical: "TOP URGENCY",
  warning:  "ELEVATED",
  info:     "INFORMATIONAL",
};

function fmt(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function categoryOf(nodeId: string) {
  return nodeId.replace(/_/g, " ").toUpperCase();
}

async function act(action: string, e: SignalFiredEvent) {
  await client.postSignal(e.toAgent, { action, ref: e.summary }, "dashboard").catch(console.error);
}

// ── sub-components ────────────────────────────────────────────────────────────

function ConfidenceTriad() {
  return (
    <div className="flex space-x-1 font-mono text-[10px]" style={{ color: "var(--secondary)" }}>
      {[["D", "↑", "var(--primary)"], ["R", "↕", "var(--primary)"], ["I", "↓", "var(--error)"]].map(([l, arrow, col]) => (
        <span key={l}
          className="px-1.5 py-0.5 rounded-sm flex items-center gap-0.5"
          style={{ background: "var(--surface-container)", border: "1px solid rgba(198,197,213,0.2)" }}>
          {l} <span style={{ color: col }}>{arrow}</span>
        </span>
      ))}
    </div>
  );
}

type AnySignalEntry = (FeedEntry & { kind: "signal" }) | MockEntry;

function isReal(entry: AnySignalEntry): entry is FeedEntry & { kind: "signal" } {
  return entry.kind === "signal";
}

function CardActions({ entry, onDismiss }: { entry: AnySignalEntry; onDismiss: () => void }) {
  const e = entry.event;

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => isReal(entry) && act("prioritize", e as SignalFiredEvent)}
        className="px-3 py-1.5 font-body text-sm font-medium rounded inner-hl transition-all active:scale-95"
        style={{ background: "linear-gradient(135deg, var(--primary), var(--primary-container))", color: "var(--on-primary)", boxShadow: "0 2px 8px -2px rgba(68,80,183,0.3)" }}>
        Prioritize
      </button>
      <button
        onClick={() => isReal(entry) && act("assign", e as SignalFiredEvent)}
        className="px-3 py-1.5 font-body text-sm font-medium rounded transition-colors active:scale-95"
        style={{ background: "var(--surface-lowest)", color: "var(--on-surface)", border: "1px solid rgba(198,197,213,0.4)" }}>
        Assign
      </button>
      <button
        onClick={() => isReal(entry) && act("snooze", e as SignalFiredEvent)}
        className="px-3 py-1.5 font-body text-sm font-medium rounded transition-colors active:scale-95"
        style={{ background: "var(--surface-lowest)", color: "var(--on-surface)", border: "1px solid rgba(198,197,213,0.4)" }}>
        Snooze
      </button>
      <button
        onClick={onDismiss}
        className="ml-auto p-1.5 rounded transition-colors hover:bg-surface-container"
        title="Dismiss"
        style={{ color: "var(--outline)" }}>
        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>close</span>
      </button>
    </div>
  );
}

function HeroCard({ entry, onDismiss }: { entry: AnySignalEntry; onDismiss: () => void }) {
  const e = entry.event;
  const sev = e.severity;
  const ts = entry.ts ? fmt(entry.ts) : null;

  return (
    <article className="rounded-lg premium-shadow ghost-border inner-hl overflow-hidden relative flex flex-col group transition-all duration-200 hover:shadow-lg"
      style={{ background: "var(--surface-lowest)" }}>
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${SEV_BORDER[sev] ?? "bg-[var(--outline)]"}`} />
      <div className="p-6 pl-8 flex flex-col space-y-5">
        <div className="flex justify-between items-start">
          <div className="px-2 py-0.5 rounded-sm flex items-center space-x-1"
            style={{ background: "var(--surface-low)", border: "1px solid rgba(198,197,213,0.3)" }}>
            <span className={`w-1.5 h-1.5 rounded-full ${SEV_DOT[sev] ?? "bg-[var(--outline)]"}`} />
            <span className="font-mono text-[10px]" style={{ color: "var(--secondary)" }}>{categoryOf(e.fromAgent)}</span>
          </div>
          <div className="flex items-center gap-2">
            {!isReal(entry) && (
              <span className="font-mono text-[9px] px-1.5 py-0.5 rounded"
                style={{ background: "var(--surface-container)", color: "var(--outline)" }}>MOCK</span>
            )}
            <span className={`font-mono text-xs ${SEV_LABEL[sev] ?? ""}`}>
              {SEV_URGENCY[sev] ?? sev.toUpperCase()}
            </span>
          </div>
        </div>

        <h3 className="font-headline text-xl font-bold leading-tight" style={{ color: "var(--on-surface)" }}>
          "{e.summary}"
        </h3>

        <div className="flex flex-col space-y-3">
          <ConfidenceTriad />
          <p className="font-body text-sm italic border-l-2 pl-3"
            style={{ color: "var(--secondary)", borderColor: "rgba(198,197,213,0.3)" }}>
            {e.fromAgent}{ts ? ` · ${ts}` : ""}
          </p>
        </div>

        <div className="pt-4 mt-2 border-t" style={{ borderColor: "rgba(198,197,213,0.2)" }}>
          <CardActions entry={entry} onDismiss={onDismiss} />
        </div>
      </div>
    </article>
  );
}

function ListCard({ entry, onDismiss }: { entry: AnySignalEntry; onDismiss: () => void }) {
  const e = entry.event;
  const sev = e.severity;
  const ts = entry.ts ? fmt(entry.ts) : null;

  return (
    <article className="rounded-lg ghost-border inner-hl overflow-hidden relative flex flex-col transition-colors"
      style={{ background: "var(--surface-lowest)" }}>
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${SEV_BORDER[sev] ?? "bg-[var(--outline)]"}`} />
      <div className="p-5 pl-7 flex flex-col space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col space-y-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px]" style={{ color: "var(--secondary)" }}>{categoryOf(e.fromAgent)}</span>
              {!isReal(entry) && (
                <span className="font-mono text-[9px] px-1 py-0.5 rounded"
                  style={{ background: "var(--surface-container)", color: "var(--outline)" }}>MOCK</span>
              )}
              {ts && <span className="font-mono text-[9px]" style={{ color: "var(--outline)" }}>{ts}</span>}
            </div>
            <h3 className="font-body text-base font-medium leading-snug" style={{ color: "var(--on-surface)" }}>
              {e.summary}
            </h3>
          </div>
        </div>
        <CardActions entry={entry} onDismiss={onDismiss} />
      </div>
    </article>
  );
}

// ── page ──────────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { nodes, feed } = useEngine();
  const [dismissed, setDismissed] = useState<Set<number>>(new Set());
  const dismiss = (i: number) => setDismissed(prev => new Set([...prev, i]));

  const realSignals = feed
    .filter((e): e is FeedEntry & { kind: "signal" } =>
      e.kind === "signal" && e.event.toAgent === "output"
    )
    .sort((a, b) => (SEV_ORDER[a.event.severity] ?? 9) - (SEV_ORDER[b.event.severity] ?? 9));

  // Real signals first, then mocks; filter dismissed by index
  const allSignals: AnySignalEntry[] = [...realSignals, ...MOCK_FEED]
    .filter((_, i) => !dismissed.has(i));
  const [hero, ...rest] = allSignals;

  const WATCHLIST = [
    "EMEA Q3 Margin Compression",
    "Project 'Crisp' CapEx Override",
    "CIO Succession Planning",
    "Labor Policy Update v4",
  ];

  const DISPOSED = [
    "Approve LATAM agency fee restructuring",
    "Review Q2 Earnings Script Draft 1",
    "Acknowledge minor supply chain blip (TX)",
  ];

  return (
    <div className="min-h-screen flex flex-col items-center font-body" style={{ background: "var(--surface)", color: "var(--on-surface)" }}>

      {/* Top nav */}
      <header className="w-full h-16 glass-panel border-b flex justify-between items-center px-6 sticky top-0 z-50 inner-hl"
        style={{ borderColor: "rgba(198,197,213,0.2)", boxShadow: "0 1px 0 rgba(99,102,241,0.05)" }}>
        <div className="flex items-center space-x-2">
          <img src="/bk-logo.png" alt="Burger King" className="w-8 h-8 rounded-full object-cover" />
          <span className="font-mono font-bold text-sm tracking-widest" style={{ color: "var(--on-surface)" }}>CEO REFLEX</span>
          <span className="px-2 py-0.5 rounded-full font-mono text-[10px]"
            style={{ background: "var(--surface-low)", color: "var(--outline)", border: "1px solid rgba(198,197,213,0.3)" }}>V3.4</span>
        </div>

        {/* Calibration strip */}
        <div className="flex flex-col items-center w-80 opacity-80 hover:opacity-100 transition-opacity">
          <div className="font-mono text-[10px]" style={{ color: "var(--secondary)" }}>
            calibration · Data 89 · Relev 72 · Interp 51{" "}
            <span className="font-bold" style={{ color: "var(--primary)" }}>↗ +18pp</span>
          </div>
          <div className="font-mono text-[8px] tracking-tighter sparkline mt-0.5 w-full text-center select-none overflow-hidden whitespace-nowrap">
            ▃▅▇█▆▅▃▂▃▅▇█▆▅▃▂▃▅▇█▆▅▃▂▃▅▇█▆▅▃▂▃▅▇█
          </div>
        </div>

        <div className="flex items-center space-x-4">
          <span className="material-symbols-outlined ms text-[20px]" style={{ color: "var(--outline)" }}>settings</span>
          <div className="h-5 w-px" style={{ background: "rgba(198,197,213,0.4)" }} />
          <div className="flex items-center space-x-3 cursor-pointer">
            <span className="font-body text-sm" style={{ color: "var(--secondary)" }}>Joshua Kobza</span>
            <img src="/kobza-photo.png" alt="Joshua Kobza"
              className="w-9 h-9 rounded-full object-cover"
              style={{ border: "1px solid rgba(198,197,213,0.4)" }} />
          </div>
          <div className="h-5 w-px" style={{ background: "rgba(198,197,213,0.4)" }} />
          <Link to="/" className="font-body text-sm transition-colors" style={{ color: "var(--secondary)" }}>
            ← Tree
          </Link>
        </div>
      </header>

      {/* Mission / Vision / Values ribbon */}
      <div className="w-full border-b py-3 px-8" style={{ background: "var(--bg-cream)", borderColor: "rgba(198,197,213,0.2)" }}>
        <div className="w-full max-w-[1440px] mx-auto grid grid-cols-3 gap-6 items-start divide-x" style={{ borderColor: "#E6E8EC" }}>
          {[
            ["Mission", "Reasonably priced, quality food served quickly in clean, attractive surroundings."],
            ["Vision",  "The world's most profitable QSR through a strong franchise system and dedicated employees."],
            ["Values",  "Teamwork · Excellence · Respect · 'Have it Your Way'"],
          ].map(([label, text], i) => (
            <div key={label} className={`flex flex-col space-y-1 ${i === 0 ? "pr-6" : i === 1 ? "px-6" : "pl-6"}`}>
              <h4 className="font-mono text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--red-brand)" }}>{label}</h4>
              <p className="font-body text-xs leading-snug" style={{ color: "var(--on-surface-variant)" }}>{text}</p>
            </div>
          ))}
        </div>
        <div className="w-full flex justify-center space-x-3 mt-3">
          {["Quality & Value", "Speed", "Environment"].map(tag => (
            <span key={tag} className="px-2 py-0.5 rounded-full font-body text-[10px]"
              style={{ border: "1px solid rgba(138,143,153,0.4)", color: "#8A8F99" }}>{tag}</span>
          ))}
        </div>
      </div>

      {/* Main */}
      <main className="w-full max-w-[1440px] px-8 py-8 flex flex-col space-y-6">

        {/* Pre-feed bar */}
        <div className="w-full flex justify-between items-end border-b pb-4" style={{ borderColor: "rgba(198,197,213,0.2)" }}>
          <div className="flex items-center space-x-2 font-body text-sm" style={{ color: "var(--secondary)" }}>
            <span className="ms text-[16px]" style={{ color: "var(--outline)" }}>history</span>
            <span>{nodes.size} nodes · {realSignals.length} live signal{realSignals.length !== 1 ? "s" : ""}
              {realSignals.filter(s => s.event.severity === "critical").length > 0 && (
                <span style={{ color: "var(--error)", fontWeight: 500 }}>
                  {" "}· {realSignals.filter(s => s.event.severity === "critical").length} above threshold
                </span>
              )}
            </span>
          </div>
          <div className="font-mono text-[10px] uppercase tracking-widest" style={{ color: "var(--outline)" }}>
            Last updated: {new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} UTC
          </div>
        </div>

        {/* Two-column grid */}
        <div className="grid grid-cols-1 md:grid-cols-[65fr_35fr] gap-8 items-start">

          {/* Left: Ranked feed */}
          <section className="flex flex-col space-y-4 w-full">
            <div className="flex justify-between items-center mb-2">
              <h2 className="font-mono text-xs font-bold tracking-widest uppercase" style={{ color: "var(--on-surface)" }}>Ranked Feed</h2>
              <span className="font-body text-xs" style={{ color: "var(--secondary)" }}>
                {realSignals.length > 0 && <span style={{ color: "var(--primary)" }}>{realSignals.length} live · </span>}
                {MOCK_FEED.length} mock
              </span>
            </div>

            {!hero && (
              <div className="rounded-lg p-10 text-center font-body text-sm"
                style={{ background: "var(--surface-container)", color: "var(--outline)" }}>
                No signals yet — submit a run to start.
              </div>
            )}

            {hero && <HeroCard entry={hero} onDismiss={() => dismiss(0)} />}
            {rest.map((entry, i) => <ListCard key={i} entry={entry} onDismiss={() => dismiss(i + 1)} />)}
          </section>

          {/* Right: Widgets */}
          <aside className="flex flex-col space-y-6 w-full">

            {/* Watch-list */}
            <div className="rounded-lg ghost-border inner-hl p-5 flex flex-col space-y-4"
              style={{ background: "var(--surface-lowest)" }}>
              <h4 className="font-mono text-[10px] font-bold tracking-widest uppercase border-b pb-2"
                style={{ color: "var(--on-surface)", borderColor: "rgba(198,197,213,0.2)" }}>Watch-List</h4>
              <ul className="flex flex-col space-y-1">
                {WATCHLIST.map(item => (
                  <li key={item}
                    className="flex items-center justify-between py-2 px-2 rounded-md cursor-pointer transition-colors"
                    style={{ color: "var(--secondary)" }}
                    onMouseEnter={e => (e.currentTarget.style.background = "var(--surface-low)")}
                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                    <span className="font-body text-sm truncate pr-4">{item}</span>
                    <span className="ms text-[14px]" style={{ color: "var(--outline)" }}>arrow_forward</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Recently disposed */}
            <div className="rounded-lg ghost-border inner-hl p-5 flex flex-col space-y-4 opacity-80"
              style={{ background: "var(--surface-lowest)" }}>
              <h4 className="font-mono text-[10px] font-bold tracking-widest uppercase border-b pb-2"
                style={{ color: "var(--on-surface)", borderColor: "rgba(198,197,213,0.2)" }}>Recently Disposed</h4>
              <ul className="flex flex-col space-y-1">
                {DISPOSED.map(item => (
                  <li key={item} className="flex items-center justify-between py-2 px-2">
                    <span className="font-body text-sm truncate pr-4 line-through" style={{ color: "var(--outline)" }}>
                      {item}
                    </span>
                    <span className="ms text-[14px]" style={{ color: "var(--outline)" }}>check</span>
                  </li>
                ))}
              </ul>
            </div>

          </aside>
        </div>
      </main>
    </div>
  );
}
