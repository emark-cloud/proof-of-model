"use client";

/**
 * The §2.3 live data layer — fills the §2.2 prop shapes (lib/types.ts) from chain.
 *
 *  1. Backfill  — getContractEvents from the deploy block (lib/chain.deployBlock) so
 *     the feed is non-empty on load (phase3-plan §2.3.3). The public RPC serves the
 *     whole range in one shot (few logs).
 *  2. Live      — watchContractEvent per contract. Over the http transport viem polls
 *     (pollingInterval ~4s) — that IS the §2.3.1 "poll fallback every ~5s"; a WS
 *     transport would upgrade it transparently.
 *  3. Reads     — Registry.providers(addr) for each discovered provider hydrates the
 *     cards; re-read (debounced) on each relevant event (§2.3.2).
 *  4. Connection — useBlockNumber({watch}) drives the live indicator.
 *
 * Read-only (CLAUDE.md invariant): getLogs + readContract only, never a write.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePublicClient, useBlockNumber } from "wagmi";
import type { Abi, Address, Hex, PublicClient } from "viem";

import { addresses, deployBlock } from "./chain";
import { registryAbi, challengeManagerAbi, escrowAbi } from "./contracts";
import { reputationScore } from "./reputation";
import {
  byNewest,
  logToFeedEvent,
  type ContractKind,
  type NormalizedLog,
} from "./events";
import type { FeedEvent, ProtocolStats, ProviderCardData } from "./types";

const MAX_FEED = 100;
const POLL_MS = 4000;

interface ContractSpec {
  kind: ContractKind;
  address: Address | null;
  abi: Abi;
}

function specs(): ContractSpec[] {
  return [
    { kind: "registry", address: addresses.Registry, abi: registryAbi },
    {
      kind: "challengeManager",
      address: addresses.ChallengeManager,
      abi: challengeManagerAbi,
    },
    { kind: "escrow", address: addresses.Escrow, abi: escrowAbi },
  ];
}

export interface ProtocolData {
  events: FeedEvent[];
  stats: ProtocolStats;
  providers: ProviderCardData[];
  /** Live RPC reachable (block number advancing). */
  connected: boolean;
  blockNumber: bigint | undefined;
  /** False until the first backfill resolves. */
  ready: boolean;
}

export function useProtocolData(): ProtocolData {
  const publicClient = usePublicClient();
  const { data: blockNumber } = useBlockNumber({ watch: true });

  const [rawLogs, setRawLogs] = useState<NormalizedLog[]>([]);
  const [providers, setProviders] = useState<ProviderCardData[]>([]);
  const [ready, setReady] = useState(false);

  const seen = useRef<Set<string>>(new Set());
  const reReadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Merge helper: dedupe by tx:logIndex, attach block timestamps best-effort ──
  const ingest = useCallback(
    async (client: PublicClient, incoming: NormalizedLog[]) => {
      const fresh = incoming.filter((l) => {
        const id = `${l.txHash}:${l.logIndex}`;
        if (seen.current.has(id)) return false;
        seen.current.add(id);
        return true;
      });
      if (fresh.length === 0) return;

      await attachTimestamps(client, fresh);
      setRawLogs((prev) => [...prev, ...fresh]);
    },
    [],
  );

  // ── Read Registry.providers for every discovered provider → cards ─────────────
  const refreshProviders = useCallback(
    async (client: PublicClient, providerAddrs: Address[]) => {
      const registry = addresses.Registry;
      if (!registry || providerAddrs.length === 0) return;

      const cards = await Promise.all(
        providerAddrs.map(async (addr, i): Promise<ProviderCardData> => {
          const [weightRoot, stake, active, served, challenged, slashed] =
            (await client.readContract({
              address: registry,
              abi: registryAbi,
              functionName: "providers",
              args: [addr],
            })) as [Hex, bigint, boolean, bigint, bigint, bigint];

          const servedN = Number(served);
          const slashedN = Number(slashed);
          return {
            address: addr,
            label: `PROVIDER_${String.fromCharCode(65 + i)}`,
            weightRoot,
            stakeWei: stake,
            served: servedN,
            challenged: Number(challenged),
            slashed: slashedN,
            reputation: reputationScore({ served: servedN, slashed: slashedN }),
            status: active ? "ACTIVE" : "SLASHED",
          };
        }),
      );
      setProviders(cards);
    },
    [],
  );

  // ── 1. Backfill on mount ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!publicClient || deployBlock === null) {
      setReady(true);
      return;
    }
    let cancelled = false;

    (async () => {
      const all: NormalizedLog[] = [];
      for (const s of specs()) {
        if (!s.address) continue;
        const logs = await publicClient.getContractEvents({
          address: s.address,
          abi: s.abi,
          fromBlock: deployBlock,
          toBlock: "latest",
        });
        for (const log of logs) all.push(normalize(s.kind, log));
      }
      if (cancelled) return;

      await ingest(publicClient, all);
      const providerAddrs = discoverProviders(all);
      await refreshProviders(publicClient, providerAddrs);
      if (!cancelled) setReady(true);
    })().catch((e) => {
      console.error("backfill failed", e);
      if (!cancelled) setReady(true);
    });

    return () => {
      cancelled = true;
    };
  }, [publicClient, ingest, refreshProviders]);

  // ── 2. Live subscriptions (polling over http) ─────────────────────────────────
  useEffect(() => {
    if (!publicClient || deployBlock === null) return;
    const unwatchers = specs()
      .filter((s) => s.address)
      .map((s) =>
        publicClient.watchContractEvent({
          address: s.address as Address,
          abi: s.abi,
          pollingInterval: POLL_MS,
          onLogs: (logs) => {
            const norm = logs.map((log) => normalize(s.kind, log as DecodedLog));
            ingest(publicClient, norm).then(() => scheduleReRead(publicClient));
          },
          onError: (err) => console.warn(`watch ${s.kind} error`, err),
        }),
      );
    return () => unwatchers.forEach((u) => u());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publicClient, ingest]);

  // Debounced provider re-read after a burst of live events.
  const scheduleReRead = useCallback(
    (client: PublicClient) => {
      if (reReadTimer.current) clearTimeout(reReadTimer.current);
      reReadTimer.current = setTimeout(() => {
        setRawLogs((cur) => {
          refreshProviders(client, discoverProviders(cur));
          return cur;
        });
      }, 800);
    },
    [refreshProviders],
  );

  // ── Derived: feed events + stats ──────────────────────────────────────────────
  const labelByAddr = useMemo(() => buildLabels(rawLogs), [rawLogs]);
  const labelFor = useCallback(
    (addr: string) =>
      labelByAddr.get(addr.toLowerCase()) ?? shortAddr(addr),
    [labelByAddr],
  );

  const events = useMemo(() => {
    return rawLogs
      .map((l) => logToFeedEvent(l, { labelFor }))
      .filter((e): e is FeedEvent => e !== null)
      .sort(byNewest)
      .slice(0, MAX_FEED);
  }, [rawLogs, labelFor]);

  const stats = useMemo<ProtocolStats>(() => {
    let finalized = 0,
      slashed = 0,
      challenges = 0,
      fees = 0n;
    for (const l of rawLogs) {
      if (l.contract === "challengeManager") {
        if (l.eventName === "Finalized") finalized++;
        else if (l.eventName === "Slashed") slashed++;
        else if (l.eventName === "ChallengeOpened") challenges++;
      } else if (l.contract === "escrow" && l.eventName === "Released") {
        fees += (l.args.amount as bigint) ?? 0n;
      }
    }
    return {
      totalInferences: finalized + slashed,
      challengesFiled: challenges,
      slashRate: challenges > 0 ? slashed / challenges : 0,
      totalFeesWei: fees,
      activeProviders: providers.filter((p) => p.status === "ACTIVE").length,
    };
  }, [rawLogs, providers]);

  return {
    events,
    stats,
    providers,
    connected: blockNumber !== undefined,
    blockNumber,
    ready,
  };
}

// ─── helpers ──────────────────────────────────────────────────────────────────

/** Minimal decoded-log shape shared by getContractEvents + watchContractEvent. */
interface DecodedLog {
  eventName?: string;
  args?: Record<string, unknown> | readonly unknown[];
  transactionHash: Hex | null;
  logIndex: number | null;
  blockNumber: bigint | null;
}

function normalize(kind: ContractKind, log: DecodedLog): NormalizedLog {
  return {
    contract: kind,
    eventName: log.eventName ?? "",
    args: (Array.isArray(log.args) ? {} : (log.args ?? {})) as Record<
      string,
      unknown
    >,
    txHash: (log.transactionHash ?? "0x") as Hex,
    logIndex: log.logIndex ?? 0,
    blockNumber: log.blockNumber ?? 0n,
  };
}

/** ProviderRegistered addresses in block order — registration order = label order. */
function discoverProviders(logs: NormalizedLog[]): Address[] {
  const seen = new Set<string>();
  const out: Address[] = [];
  for (const l of [...logs].sort((a, b) =>
    a.blockNumber < b.blockNumber ? -1 : 1,
  )) {
    if (l.contract === "registry" && l.eventName === "ProviderRegistered") {
      const addr = (l.args.provider as string)?.toLowerCase();
      if (addr && !seen.has(addr)) {
        seen.add(addr);
        out.push(l.args.provider as Address);
      }
    }
  }
  return out;
}

function buildLabels(logs: NormalizedLog[]): Map<string, string> {
  const addrs = discoverProviders(logs);
  const m = new Map<string, string>();
  addrs.forEach((a, i) =>
    m.set(a.toLowerCase(), `PROVIDER_${String.fromCharCode(65 + i)}`),
  );
  return m;
}

const shortAddr = (a: string) =>
  a.length >= 10 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;

/** Fetch unique block timestamps and stamp them onto the logs (best-effort). */
async function attachTimestamps(
  client: PublicClient,
  logs: NormalizedLog[],
): Promise<void> {
  const blocks = [...new Set(logs.map((l) => l.blockNumber))];
  const times = new Map<bigint, number>();
  await Promise.all(
    blocks.map(async (bn) => {
      try {
        const b = await client.getBlock({ blockNumber: bn });
        times.set(bn, Number(b.timestamp) * 1000);
      } catch {
        /* leave undefined → feed shows --:--:-- */
      }
    }),
  );
  for (const l of logs) l.timestamp = times.get(l.blockNumber);
}
