/**
 * Demo-control proxy — for a deploy that can't spawn the driver itself.
 *
 * Vercel's serverless runtime can't run the long-lived demo driver (no persistent
 * process, no port-binding providers, function time caps). Set DEMO_PROXY_URL to a
 * long-running host that CAN (Railway) and the /api/demo/* routes forward there
 * instead of driving locally — a server-to-server fetch, so no browser CORS and no
 * key ever touches this deploy. The visitor clicks Run ON this page; the driver runs
 * upstream; the live PASS/SLASH feed renders here regardless because it reads the
 * chain directly. Unset (Railway / local) → routes use the in-process driver.
 */
import { NextResponse } from "next/server";

import type { DriverStatus } from "./driver";

/** The upstream demo host, or null when this deploy drives the demo itself. */
export function proxyTarget(): string | null {
  const raw = process.env.DEMO_PROXY_URL?.trim();
  if (!raw) return null;
  return raw.replace(/\/+$/, ""); // tolerate a trailing slash
}

/** Forward a demo-control call to the upstream host and relay its JSON response. */
export async function proxyDemo(
  path: "status" | "start" | "stop",
  init?: RequestInit,
): Promise<Response> {
  const base = proxyTarget();
  if (!base) throw new Error("proxyDemo called without DEMO_PROXY_URL");
  try {
    const r = await fetch(`${base}/api/demo/${path}`, { ...init, cache: "no-store" });
    const data = (await r.json()) as DriverStatus;
    return NextResponse.json(data, { status: r.status });
  } catch (e) {
    // Keep the button alive but surface the failure in the UI's error line.
    const msg = e instanceof Error ? e.message : String(e);
    const fallback: DriverStatus = {
      available: true,
      running: false,
      startedAt: null,
      cheatEvery: 4,
      pauseMs: 4000,
      cycle: null,
      mode: null,
      log: [],
      error: `demo host unreachable: ${msg}`,
    };
    return NextResponse.json(fallback, { status: 502 });
  }
}
