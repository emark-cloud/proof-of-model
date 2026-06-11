"use client";

/**
 * DemoControl — the visible "Run Demo" launcher + the always-on explainer that makes
 * the dashboard self-describing (so anyone who lands here can start the show AND
 * understand what they're watching).
 *
 * This is the ONE deliberate break from the read-only invariant (CLAUDE.md / design.md
 * §9, decision 2026-06-11): a control that starts/stops the *off-chain agent driver*.
 * It does NOT let a human participate in the protocol — there is no submit-challenge,
 * no manual slash. The agents still do all protocol work; the button just kicks them
 * off. Private keys live server-side (the API route spawns scripts/demo-driver.ts which
 * loads the repo `.env`); the browser never sees a key.
 *
 * It polls /api/demo/status to narrate live (cycle number, HONEST/CHEAT, log tail) and
 * POSTs /api/demo/{start,stop}. On a hosted deploy with no driver, it degrades to the
 * explainer alone.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

interface DriverStatus {
  available: boolean;
  running: boolean;
  startedAt: number | null;
  cheatEvery: number;
  pauseMs: number;
  cycle: number | null;
  mode: "HONEST" | "CHEAT" | null;
  log: string[];
  error: string | null;
}

const POLL_MS = 1500;

/** The protocol flow, in plain language — the "understand what's going on" layer. */
const FLOW: { n: number; label: string; tone: string; text: string }[] = [
  {
    n: 1,
    label: "PAY",
    tone: "text-cyan-accent",
    text: "A buyer agent pays a provider per call (escrow rail on Sepolia).",
  },
  {
    n: 2,
    label: "COMMIT",
    tone: "text-text-primary",
    text: "The provider returns the output and commits a Merkle root of its activation trace on-chain.",
  },
  {
    n: 3,
    label: "SAMPLE",
    tone: "text-amber-pending",
    text: "A challenger picks a random output→input path and demands the provider open it.",
  },
  {
    n: 4,
    label: "VERIFY",
    tone: "text-green-pass",
    text: "The Stylus verifier recomputes each node in fixed-point against the committed weights.",
  },
  {
    n: 5,
    label: "SETTLE",
    tone: "text-red-slash",
    text: "Match → PASS, fee released (green). Mismatch → SLASH: stake wiped, bounty paid to the challenger (red).",
  },
];

export function DemoControl() {
  const [st, setSt] = useState<DriverStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [cheatEvery, setCheatEvery] = useState(4);
  const [pauseMs, setPauseMs] = useState(4000);
  const [expanded, setExpanded] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const logBoxRef = useRef<HTMLDivElement>(null);

  // Poll status.
  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/demo/status", { cache: "no-store" });
      const data = (await r.json()) as DriverStatus;
      setSt(data);
    } catch {
      /* keep last known state */
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, POLL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  // Tick a clock for the runtime readout while running.
  useEffect(() => {
    if (!st?.running) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [st?.running]);

  // Auto-scroll the log to the newest line while the panel is open.
  useEffect(() => {
    const el = logBoxRef.current;
    if (el && expanded) el.scrollTop = el.scrollHeight;
  }, [st?.log, expanded]);

  const post = useCallback(
    async (path: string, body?: unknown) => {
      setBusy(true);
      try {
        const r = await fetch(path, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: body ? JSON.stringify(body) : undefined,
        });
        setSt((await r.json()) as DriverStatus);
      } catch {
        /* surfaced via next poll */
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  const start = () => {
    setExpanded(true); // reveal the explainer + log when the show starts
    post("/api/demo/start", { cheatEvery, pauseMs });
  };
  const stop = () => post("/api/demo/stop");

  const running = !!st?.running;
  const available = st?.available ?? true;
  const runtime = st?.startedAt ? fmtDuration(now - st.startedAt) : null;

  return (
    <section className="border-b border-border-default bg-bg-surface/40">
      {/* ── Slim bar (always one row): title · status · run/stop · details ────── */}
      <div className="flex items-center gap-x-4 px-6 py-2.5">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-2 font-mono text-sm font-bold tracking-tight text-text-primary transition hover:text-green-pass"
          title={expanded ? "Collapse" : "Expand — what is this?"}
        >
          <span className="text-text-secondary">{expanded ? "▾" : "▸"}</span>
          ▶ LIVE DEMO
        </button>
        <StatusPill running={running} mode={st?.mode ?? null} />

        {running && (
          <span className="hidden items-center gap-2 font-mono text-xs text-text-secondary sm:flex">
            {st?.cycle != null && (
              <span>
                cycle <span className="text-text-primary">{st.cycle}</span>
              </span>
            )}
            {runtime && (
              <>
                <span className="text-text-dim">·</span>
                <span>{runtime}</span>
              </>
            )}
            <span className="text-text-dim">·</span>
            <span>cheat every {st?.cheatEvery}</span>
          </span>
        )}

        <div className="ml-auto flex items-center gap-3">
          {!expanded && available && (
            <button
              onClick={() => setExpanded(true)}
              className="hidden font-mono text-[11px] text-cyan-accent hover:underline md:inline"
            >
              what is this?
            </button>
          )}
          {available ? (
            running ? (
              <button
                onClick={stop}
                disabled={busy}
                className="rounded border border-red-slash/50 bg-red-dim px-4 py-1.5 font-mono text-sm font-bold text-red-slash transition hover:bg-red-slash/20 disabled:opacity-50"
              >
                ■ STOP
              </button>
            ) : (
              <button
                onClick={start}
                disabled={busy}
                className="rounded border border-green-pass/50 bg-green-dim px-4 py-1.5 font-mono text-sm font-bold text-green-pass shadow-glow-green transition hover:bg-green-pass/20 disabled:opacity-50"
              >
                ▶ RUN DEMO
              </button>
            )
          ) : (
            <span className="font-mono text-xs text-text-secondary">
              run locally to drive
            </span>
          )}
        </div>
      </div>

      {/* ── Expanded detail: cadence · explainer · log (the "understand it" layer) ─ */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="border-t border-border-default px-6 py-3">
              {available && !running && (
                <div className="mb-3 flex flex-wrap items-center gap-3">
                  <Selector
                    label="cheat every"
                    value={cheatEvery}
                    onChange={setCheatEvery}
                    options={[
                      [2, "2nd"],
                      [3, "3rd"],
                      [4, "4th"],
                      [6, "6th"],
                    ]}
                  />
                  <Selector
                    label="speed"
                    value={pauseMs}
                    onChange={setPauseMs}
                    options={[
                      [2000, "fast"],
                      [4000, "normal"],
                      [6000, "calm"],
                    ]}
                  />
                </div>
              )}

              {/* Flow explainer */}
              <div className="flex flex-wrap items-stretch gap-2">
                {FLOW.map((s, i) => (
                  <div key={s.n} className="flex items-center gap-2">
                    <div className="max-w-[15rem] rounded border border-border-default bg-bg-primary/50 px-3 py-2">
                      <div className={`font-mono text-xs font-bold ${s.tone}`}>
                        {s.n}. {s.label}
                      </div>
                      <div className="mt-0.5 text-[11px] leading-snug text-text-secondary">
                        {s.text}
                      </div>
                    </div>
                    {i < FLOW.length - 1 && (
                      <span className="font-mono text-text-dim">→</span>
                    )}
                  </div>
                ))}
              </div>

              <p className="mt-2 font-mono text-[11px] text-text-secondary">
                Green = honest and paid · Red = caught and slashed. No human approves
                any step — you&apos;re watching agents police each other.
              </p>

              {st?.error && (
                <p className="mt-2 font-mono text-[11px] text-red-slash">
                  ⚠ {st.error}
                </p>
              )}

              {/* Driver log tail */}
              {available && (
                <div
                  ref={logBoxRef}
                  className="mt-3 max-h-32 overflow-y-auto rounded border border-border-default bg-bg-primary px-3 py-2 font-mono text-[11px] leading-relaxed text-text-secondary"
                >
                  {st?.log && st.log.length > 0 ? (
                    st.log.map((line, i) => (
                      <div
                        key={i}
                        className={
                          line.includes("SLASH")
                            ? "text-red-slash"
                            : line.includes("PASS") || line.includes("released")
                              ? "text-green-pass"
                              : line.includes("CHEAT")
                                ? "text-amber-pending"
                                : undefined
                        }
                      >
                        {line}
                      </div>
                    ))
                  ) : (
                    <span className="text-text-dim">
                      {running
                        ? "waiting for the first cycle…"
                        : "driver idle — press ▶ RUN DEMO."}
                    </span>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

function StatusPill({
  running,
  mode,
}: {
  running: boolean;
  mode: "HONEST" | "CHEAT" | null;
}) {
  if (!running) {
    return (
      <span className="flex items-center gap-1.5 font-mono text-[11px] text-text-secondary">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-text-dim" />
        idle
      </span>
    );
  }
  const cheat = mode === "CHEAT";
  return (
    <span
      className={`flex items-center gap-1.5 font-mono text-[11px] font-bold ${
        cheat ? "text-red-slash" : "text-green-pass"
      }`}
    >
      <span
        className={`inline-block h-1.5 w-1.5 rounded-full ${
          cheat ? "bg-red-slash shadow-glow-red" : "bg-green-pass shadow-glow-green"
        }`}
      />
      {cheat ? "cheating cycle" : "honest cadence"}
    </span>
  );
}

function Selector<T extends number>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: [T, string][];
}) {
  return (
    <label className="flex items-center gap-1.5 font-mono text-[11px] text-text-secondary">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value) as T)}
        className="rounded border border-border-default bg-bg-primary px-1.5 py-1 font-mono text-[11px] text-text-primary"
      >
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}

function fmtDuration(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}
