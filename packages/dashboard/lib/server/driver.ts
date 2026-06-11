/**
 * Server-side controller for the demo driver (the "Run Demo" button's backend).
 *
 * The browser must NEVER hold a private key (read-only + security invariant), so the
 * frontend can't drive on-chain txs itself. Instead the dashboard server spawns the
 * existing, tested `scripts/demo-driver.ts` as a child process — keys stay in the
 * repo-root `.env` that the script loads itself; they never touch the dashboard's own
 * env or the client bundle. This module owns that child process lifecycle and a small
 * ring buffer of its stdout so the UI can narrate what's happening.
 *
 * The handle lives on globalThis so it survives Next's dev HMR and is shared across
 * route-handler module instances. A safety timer auto-stops the driver after
 * MAX_RUN_MS so a forgotten-running demo can't quietly drain the testnet wallet.
 *
 * NOTE (read-only invariant): this is the ONE deliberate exception (see CLAUDE.md /
 * design.md §9). It starts/stops the *off-chain agent driver* — it does not let a
 * human participate in the protocol (no submit-challenge, no manual slash). The agents
 * still do all protocol work; the human just kicks off the show.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";

const MAX_LOG = 60;
/** Safety auto-stop — caps unattended testnet fund drain (each cheat cycle burns ~0.001 ETH). */
const MAX_RUN_MS = 10 * 60_000;
/** Grace after SIGINT before a hard kill, so the current cycle can settle cleanly. */
const HARD_KILL_MS = 15_000;

export type DriverMode = "HONEST" | "CHEAT";

interface DriverState {
  child: ChildProcess | null;
  startedAt: number | null;
  cheatEvery: number;
  pauseMs: number;
  cycle: number | null;
  mode: DriverMode | null;
  log: string[];
  error: string | null;
  stopTimer: ReturnType<typeof setTimeout> | null;
}

export interface DriverStatus {
  /** Can the driver run here? (repo + .env present — false on a hosted deploy.) */
  available: boolean;
  running: boolean;
  startedAt: number | null;
  cheatEvery: number;
  pauseMs: number;
  cycle: number | null;
  mode: DriverMode | null;
  log: string[];
  error: string | null;
}

const g = globalThis as unknown as { __demoDriver?: DriverState };

function state(): DriverState {
  if (!g.__demoDriver) {
    g.__demoDriver = {
      child: null,
      startedAt: null,
      cheatEvery: 4,
      pauseMs: 4000,
      cycle: null,
      mode: null,
      log: [],
      error: null,
      stopTimer: null,
    };
  }
  return g.__demoDriver;
}

/** Walk up from cwd looking for the pnpm workspace root. */
function findRepoRoot(): string | null {
  let dir = process.cwd();
  for (let i = 0; i < 8; i++) {
    if (existsSync(resolve(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

export function driverAvailable(): boolean {
  const root = findRepoRoot();
  return (
    !!root &&
    existsSync(resolve(root, ".env")) &&
    existsSync(resolve(root, "scripts/demo-driver.ts"))
  );
}

function pushLog(s: DriverState, chunk: string): void {
  for (const raw of chunk.split(/\r?\n/)) {
    const line = raw.replace(/\s+$/, "");
    if (!line.trim()) continue;
    s.log.push(line);
    // Parse the driver's `banner(`cycle N · HONEST|CHEAT`)` line for live status.
    const m = line.match(/cycle\s+(\d+)\s+·\s+(HONEST|CHEAT)/);
    if (m) {
      s.cycle = Number(m[1]);
      s.mode = m[2] as DriverMode;
    }
  }
  if (s.log.length > MAX_LOG) s.log.splice(0, s.log.length - MAX_LOG);
}

export function startDriver(opts: {
  cheatEvery?: number;
  pauseMs?: number;
}): DriverStatus {
  const s = state();
  if (s.child) return status(); // idempotent — one driver at a time

  const root = findRepoRoot();
  if (!root) {
    s.error = "repo root not found — demo driver unavailable in this environment";
    return status();
  }

  if (typeof opts.cheatEvery === "number") s.cheatEvery = opts.cheatEvery;
  if (typeof opts.pauseMs === "number") s.pauseMs = opts.pauseMs;
  s.error = null;
  s.log = [];
  s.cycle = null;
  s.mode = null;

  let child: ChildProcess;
  try {
    child = spawn("pnpm", ["demo:driver"], {
      cwd: root,
      env: {
        ...process.env,
        CHEAT_EVERY: String(s.cheatEvery),
        PAUSE_MS: String(s.pauseMs),
      },
    });
  } catch (e) {
    s.error = e instanceof Error ? e.message : String(e);
    return status();
  }

  s.child = child;
  s.startedAt = Date.now();

  child.stdout?.on("data", (d: Buffer) => pushLog(s, d.toString()));
  child.stderr?.on("data", (d: Buffer) => pushLog(s, d.toString()));
  child.on("error", (e: Error) => {
    s.error = e.message;
  });
  child.on("exit", (code) => {
    pushLog(s, `▶ driver exited (code ${code ?? "?"})`);
    s.child = null;
    s.startedAt = null;
    s.mode = null;
    if (s.stopTimer) {
      clearTimeout(s.stopTimer);
      s.stopTimer = null;
    }
  });

  if (s.stopTimer) clearTimeout(s.stopTimer);
  s.stopTimer = setTimeout(() => stopDriver(), MAX_RUN_MS);

  return status();
}

export function stopDriver(): DriverStatus {
  const s = state();
  if (s.stopTimer) {
    clearTimeout(s.stopTimer);
    s.stopTimer = null;
  }
  const child = s.child;
  if (child) {
    child.kill("SIGINT"); // clean stop — driver finishes the current cycle, then closes
    // Backstop: force-kill if it hasn't exited. (Don't guard on child.killed — Node
    // sets that true after the SIGINT above, which would suppress the SIGKILL.)
    setTimeout(() => {
      if (s.child === child && child.exitCode === null) child.kill("SIGKILL");
    }, HARD_KILL_MS);
  }
  return status();
}

export function status(): DriverStatus {
  const s = state();
  return {
    available: driverAvailable(),
    running: !!s.child,
    startedAt: s.startedAt,
    cheatEvery: s.cheatEvery,
    pauseMs: s.pauseMs,
    cycle: s.cycle,
    mode: s.mode,
    log: s.log.slice(-40),
    error: s.error,
  };
}
