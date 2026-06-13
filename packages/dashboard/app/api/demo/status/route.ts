/**
 * GET /api/demo/status — current driver state + a tail of its stdout, polled by the
 * DemoControl panel so the UI can narrate live (cycle number, HONEST/CHEAT, log).
 */
import { NextResponse } from "next/server";
import { status } from "@/lib/server/driver";
import { proxyDemo, proxyTarget } from "@/lib/server/proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  if (proxyTarget()) return proxyDemo("status");
  return NextResponse.json(status());
}
