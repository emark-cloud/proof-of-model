/**
 * POST /api/demo/start — spawn the off-chain demo driver (server-side; keys never
 * reach the browser). Idempotent: if a driver is already running it returns its
 * status without spawning a second (two drivers would collide on agent nonces).
 *
 * Body (optional): { cheatEvery?: number, pauseMs?: number } — clamped to sane ranges.
 */
import { NextResponse } from "next/server";
import { startDriver } from "@/lib/server/driver";
import { proxyDemo, proxyTarget } from "@/lib/server/proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clampInt(v: unknown, lo: number, hi: number, dflt: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return dflt;
  return Math.min(hi, Math.max(lo, Math.round(n)));
}

export async function POST(req: Request): Promise<Response> {
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    /* empty body is fine — use defaults */
  }
  const cheatEvery = clampInt(body.cheatEvery, 2, 20, 4);
  const pauseMs = clampInt(body.pauseMs, 1000, 20_000, 4000);
  if (proxyTarget()) {
    return proxyDemo("start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ cheatEvery, pauseMs }),
    });
  }
  return NextResponse.json(startDriver({ cheatEvery, pauseMs }));
}
