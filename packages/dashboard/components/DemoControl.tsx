"use client";

/**
 * DemoControl — the visible "Run Demo" launcher (a single always-on bar, no expander).
 *
 * This is the ONE deliberate break from the read-only invariant (CLAUDE.md / design.md
 * §9, decision 2026-06-11): a control that starts/stops the *off-chain agent driver*.
 * It does NOT let a human participate in the protocol — there is no submit-challenge,
 * no manual slash. The agents still do all protocol work; the button just kicks them
 * off. Private keys live server-side (the API route spawns scripts/demo-driver.ts which
 * loads the repo `.env`); the browser never sees a key.
 *
 * It polls /api/demo/status to narrate live (cycle number, HONEST/CHEAT) and POSTs
 * /api/demo/{start,stop}. On a hosted deploy with no driver (e.g. Vercel's serverless
 * runtime, where the driver can't be spawned) it can't run the show itself — if
 * NEXT_PUBLIC_DEMO_URL points at a long-running host (Railway) it links there instead;
 * otherwise it degrades to a "run locally" label.
 */
import { useCallback, useEffect, useState } from "react";

// Where the interactive driver actually lives, for deploys that can't spawn it
// themselves (set on Vercel → the Railway URL). Empty on the host that runs it.
const LIVE_DEMO_URL = process.env.NEXT_PUBLIC_DEMO_URL?.trim() || "";

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

export function DemoControl() {
  const [st, setSt] = useState<DriverStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [cheatEvery, setCheatEvery] = useState(4);
  const [pauseMs, setPauseMs] = useState(4000);
  const [now, setNow] = useState(() => Date.now());

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

  const post = useCallback(async (path: string, body?: unknown) => {
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
  }, []);

  const start = () => post("/api/demo/start", { cheatEvery, pauseMs });
  const stop = () => post("/api/demo/stop");

  const running = !!st?.running;
  const available = st?.available ?? true;
  const runtime = st?.startedAt ? fmtDuration(now - st.startedAt) : null;

  return (
    <section className="border-b border-border-default bg-bg-surface/40">
      {/* ── Slim bar (always one row): title · status · config · run/stop ────── */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-6 py-2.5">
        <span className="font-mono text-sm font-bold tracking-tight text-text-primary">
          ▶ LIVE DEMO
        </span>
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

        <div className="ml-auto flex flex-wrap items-center gap-3">
          {available && !running && (
            <>
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
            </>
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
          ) : LIVE_DEMO_URL ? (
            <a
              href={LIVE_DEMO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded border border-green-pass/50 bg-green-dim px-4 py-1.5 font-mono text-sm font-bold text-green-pass shadow-glow-green transition hover:bg-green-pass/20"
            >
              ▶ RUN DEMO ↗
            </a>
          ) : (
            <span className="font-mono text-xs text-text-secondary">
              run locally to drive
            </span>
          )}
        </div>
      </div>

      {st?.error && (
        <p className="border-t border-border-default px-6 py-2 font-mono text-[11px] text-red-slash">
          ⚠ {st.error}
        </p>
      )}
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
