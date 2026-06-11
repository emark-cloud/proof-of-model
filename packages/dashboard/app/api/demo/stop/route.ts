/**
 * POST /api/demo/stop — SIGINT the running demo driver (clean stop after the current
 * cycle; a hard-kill backstop guarantees it dies). Safe to call when nothing runs.
 */
import { NextResponse } from "next/server";
import { stopDriver } from "@/lib/server/driver";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(): Promise<Response> {
  return NextResponse.json(stopDriver());
}
