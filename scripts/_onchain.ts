/**
 * _onchain.ts — typed on-chain reads + the `finalize` write used by the E2E
 * scripts (§2.3). Thin wrappers over the deployed contracts via the agents'
 * shared `publicClient` / addresses / ABIs, so the scripts read state without
 * re-deriving tuple layouts inline.
 */
import { formatEther, parseEventLogs } from "viem";
import type { Address, Hex } from "viem";

import {
  publicClient,
  makeIdentity,
  CONTRACTS,
  registryAbi,
  challengeManagerAbi,
  escrowAbi,
} from "@proof/agents";

import { sleep } from "./_env.js";

/** Registry `providers(address)` tuple, decoded. */
export interface ProviderState {
  weightRoot: Hex;
  stake: bigint;
  active: boolean;
  served: bigint;
  challenged: bigint;
  slashed: bigint;
}

export async function readProvider(address: Address): Promise<ProviderState> {
  const p = (await publicClient.readContract({
    address: CONTRACTS.Registry,
    abi: registryAbi,
    functionName: "providers",
    args: [address],
  })) as readonly [Hex, bigint, boolean, bigint, bigint, bigint];
  return {
    weightRoot: p[0],
    stake: p[1],
    active: p[2],
    served: BigInt(p[3]),
    challenged: BigInt(p[4]),
    slashed: BigInt(p[5]),
  };
}

/** ChallengeManager `commitments(requestId)` tuple, decoded. */
export interface CommitmentState {
  provider: Address;
  traceRoot: Hex;
  outputHash: Hex;
  committedAt: bigint;
  challenger: Address;
  status: number;
}

export async function readCommitment(requestId: Hex): Promise<CommitmentState> {
  const c = (await publicClient.readContract({
    address: CONTRACTS.ChallengeManager,
    abi: challengeManagerAbi,
    functionName: "commitments",
    args: [requestId],
  })) as readonly [Address, Hex, Hex, bigint, Address, number];
  return {
    provider: c[0],
    traceRoot: c[1],
    outputHash: c[2],
    committedAt: BigInt(c[3]),
    challenger: c[4],
    status: Number(c[5]),
  };
}

/** Escrow `deposits(requestId)` slot — `amount == 0` once released or refunded. */
export async function readDeposit(requestId: Hex): Promise<{ buyer: Address; amount: bigint }> {
  const d = (await publicClient.readContract({
    address: CONTRACTS.Escrow,
    abi: escrowAbi,
    functionName: "deposits",
    args: [requestId],
  })) as readonly [Address, bigint];
  return { buyer: d[0], amount: d[1] };
}

/** The deployed ChallengeManager's finalize window (seconds). */
export async function finalizeWindow(): Promise<bigint> {
  return (await publicClient.readContract({
    address: CONTRACTS.ChallengeManager,
    abi: challengeManagerAbi,
    functionName: "finalizeWindow",
  })) as bigint;
}

/**
 * Block until the finalize window for `requestId` has elapsed (poll chain time).
 * Returns once `block.timestamp >= committedAt + finalizeWindow`.
 */
export async function waitForFinalizeWindow(requestId: Hex): Promise<void> {
  const c = await readCommitment(requestId);
  const window = await finalizeWindow();
  const target = c.committedAt + window;
  for (;;) {
    const block = await publicClient.getBlock();
    const now = BigInt(block.timestamp);
    if (now >= target) return;
    const remaining = Number(target - now);
    console.log(`   ⏳ finalize window: ${remaining}s remaining…`);
    await sleep(Math.min(remaining + 1, 5) * 1000);
  }
}

/** Call `finalize(requestId)` (anyone may) and return the tx hash. */
export async function finalizeRequest(requestId: Hex, privateKey: string): Promise<Hex> {
  const id = makeIdentity(privateKey);
  const hash = await id.wallet.writeContract({
    address: CONTRACTS.ChallengeManager,
    abi: challengeManagerAbi,
    functionName: "finalize",
    args: [requestId],
    account: id.account,
    chain: id.wallet.chain,
  });
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

/** Decode the typed events emitted by a tx, across the manager + escrow ABIs. */
export async function decodeEvents(txHash: Hex): Promise<ReturnType<typeof parseEventLogs>> {
  const receipt = await publicClient.getTransactionReceipt({ hash: txHash });
  return parseEventLogs({
    abi: [...challengeManagerAbi, ...escrowAbi],
    logs: receipt.logs,
  });
}

/** Find one decoded event by name (or undefined). */
export function eventArgs(
  events: ReturnType<typeof parseEventLogs>,
  name: string
): Record<string, unknown> | undefined {
  const ev = events.find((e) => (e as { eventName?: string }).eventName === name);
  return ev ? ((ev as { args: Record<string, unknown> }).args) : undefined;
}

export { formatEther };
