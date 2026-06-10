/**
 * PLACEHOLDER seed — the real Phase-2 Sepolia history (phase2-runlog.md), used so
 * the §2.2 components render a non-empty, honest surface before the §2.3 live data
 * layer (watchContractEvent + backfill + Registry reads) is wired. §2.3 REPLACES
 * every export here with on-chain data; nothing below is fabricated — every txHash
 * resolves on Arbiscan, every counter is the actual on-chain value.
 *
 * Honesty (phase3-plan §1.1 / CLAUDE.md): on-chain events only. The happy run emits
 * no Verified log (the challenger's all-PASS sampling is off-chain eth_call), so the
 * green VERIFY pulse only appears once a live challenge-that-passes lands via §2.3 —
 * we do NOT mint a VERIFY row with a tx hash that wouldn't resolve. The escrow rail
 * settles ETH on Sepolia (not USDC via x402 — that's the One rail), so PAYMENT lines
 * say "escrow", not "x402".
 */
import { parseEther, type Address, type Hex } from "viem";
import type { FeedEvent, ProtocolStats, ProviderCardData } from "./types";

/** Demo accounts (phase2-runlog.md §"Agent accounts"). */
export const ACCOUNTS = {
  providerHonest: "0xe6Fd606719c10F6fE268cF1AE5D99cBA43BCE6bC" as Address,
  providerCheat: "0xAa7fB65060aE5082354DdCD40FCCCf208c1EF0B0" as Address,
  buyer: "0x652Ad290efA2858e67F0698Bd68ebAce473aec45" as Address,
  challenger: "0x8EaA6b3f8e6e5abCf8C9499f02E719a016C81DbC" as Address,
} as const;

/** Committed model hash H_w — BOTH providers advertise this same root (the point). */
export const SHARED_WEIGHT_ROOT =
  "0x176800d7d7a6f962d1bae0d0fede72c1b9a4e54877ff1fe41cfdbc34f8766341" as Hex;

const REQ_HAPPY =
  "0x792c483e73f416b271b45afe2b839a0dac46c2b506abf9380883c606472381ff" as Hex;
const REQ_CHEAT =
  "0x685756bc0869510efcf8b47cd6091fa78f89f89969d39e30f9e08cc417cea981" as Hex;

// Fixed absolute timestamps (no Date.now → no SSR/client hydration drift). Two runs,
// a few seconds apart; the feed renders newest-first.
const T0 = Date.parse("2026-06-09T18:20:00Z");
const sec = (n: number) => T0 + n * 1000;

/**
 * The two recorded runs, oldest → newest. The feed component reverses for display.
 * Block numbers are illustrative ordering only (the real run didn't log them here);
 * §2.3's backfill carries the true block numbers.
 */
export const DEMO_EVENTS: FeedEvent[] = [
  // ── Happy run: honest provider PASS → fee released ───────────────────────────
  {
    id: "0x66a0707167a535e9267355a9b1d18cfc82b37270d60b9217866ffbb00baf38ea:0",
    kind: "PAYMENT",
    message: "BUYER deposited 0.00002 ETH into escrow for #792c…81ff",
    txHash:
      "0x66a0707167a535e9267355a9b1d18cfc82b37270d60b9217866ffbb00baf38ea",
    blockNumber: 1n,
    timestamp: sec(0),
    requestId: REQ_HAPPY,
  },
  {
    id: "0x0a49c95ea06f627436ed6eef4b70968e4041355f0ba4aeebf80feb894a31de31:0",
    kind: "COMMIT",
    message: "PROVIDER_A committed trace root R for #792c…81ff",
    txHash:
      "0x0a49c95ea06f627436ed6eef4b70968e4041355f0ba4aeebf80feb894a31de31",
    blockNumber: 2n,
    timestamp: sec(6),
    requestId: REQ_HAPPY,
  },
  {
    id: "0x4f3a18fba8cf50e1a67ce8a44b8376515b6fa0bae8e03f87b97c6f6919e1d9c9:0",
    kind: "FINALIZE",
    message:
      "Request #792c…81ff finalized — no challenge, fee 0.000019 ETH released to PROVIDER_A",
    txHash:
      "0x4f3a18fba8cf50e1a67ce8a44b8376515b6fa0bae8e03f87b97c6f6919e1d9c9",
    blockNumber: 3n,
    timestamp: sec(38),
    requestId: REQ_HAPPY,
  },
  // ── Cheat run: cheater FAIL → slash + bounty + refund ─────────────────────────
  {
    id: "0x05bfadac873b22ce4fb1533a68e51445608b9c5347d11ec5272a78508cc78a92:0",
    kind: "PAYMENT",
    message: "BUYER deposited 0.00002 ETH into escrow for #6857…a981",
    txHash:
      "0x05bfadac873b22ce4fb1533a68e51445608b9c5347d11ec5272a78508cc78a92",
    blockNumber: 4n,
    timestamp: sec(50),
    requestId: REQ_CHEAT,
  },
  {
    id: "0x0eb56589e1e557582cb580bfaa15a0ca7ee4d55b42f90bac3bd2840b267acd90:0",
    kind: "COMMIT",
    message: "PROVIDER_B committed trace root R for #6857…a981",
    txHash:
      "0x0eb56589e1e557582cb580bfaa15a0ca7ee4d55b42f90bac3bd2840b267acd90",
    blockNumber: 5n,
    timestamp: sec(56),
    requestId: REQ_CHEAT,
  },
  {
    id: "0xc85728686654417792d3717a1f06ad01c3c3120edb8e4fa4cc9bcc596d092585:0",
    kind: "CHALLENGE",
    message: "CHALLENGER opened a challenge on PROVIDER_B for #6857…a981",
    txHash:
      "0xc85728686654417792d3717a1f06ad01c3c3120edb8e4fa4cc9bcc596d092585",
    blockNumber: 6n,
    timestamp: sec(64),
    requestId: REQ_CHEAT,
  },
  {
    id: "0xe429796d0f6000a082997d672f88cbc8bb89b56e4e06263dd33c207c50dafac4:0",
    kind: "SLASH",
    message:
      "VERIFIER: path mismatch ✗ — PROVIDER_B SLASHED 0.001 ETH on #6857…a981",
    txHash:
      "0xe429796d0f6000a082997d672f88cbc8bb89b56e4e06263dd33c207c50dafac4",
    blockNumber: 7n,
    timestamp: sec(70),
    requestId: REQ_CHEAT,
  },
  {
    // Same resolveChallenge tx as the slash; distinct log → distinct id.
    id: "0xe429796d0f6000a082997d672f88cbc8bb89b56e4e06263dd33c207c50dafac4:1",
    kind: "BOUNTY",
    message: "CHALLENGER earned 0.0001 ETH bounty from PROVIDER_B slash",
    txHash:
      "0xe429796d0f6000a082997d672f88cbc8bb89b56e4e06263dd33c207c50dafac4",
    blockNumber: 7n,
    timestamp: sec(71),
    requestId: REQ_CHEAT,
  },
];

/** Aggregates over the two runs (design.md §4.2). */
export const DEMO_STATS: ProtocolStats = {
  totalInferences: 2, // 1 Finalized + 1 Slashed
  challengesFiled: 1, // 1 ChallengeOpened
  slashRate: 1, // 1 slash / 1 challenge
  totalFeesWei: parseEther("0.000019"), // Released.amount (happy run payout)
  activeProviders: 1, // honest active; cheat deactivated post-slash
};

/** Both cards from the real post-run Registry.providers counters. */
export const DEMO_PROVIDERS: ProviderCardData[] = [
  {
    address: ACCOUNTS.providerHonest,
    label: "PROVIDER_A",
    weightRoot: SHARED_WEIGHT_ROOT,
    stakeWei: parseEther("0.001"),
    served: 1,
    challenged: 0,
    slashed: 0,
    reputation: 50, // reputationScore({served:1, slashed:0})
    status: "ACTIVE",
  },
  {
    address: ACCOUNTS.providerCheat,
    label: "PROVIDER_B",
    weightRoot: SHARED_WEIGHT_ROOT,
    stakeWei: 0n, // full stake slashed → wiped
    served: 0,
    challenged: 1,
    slashed: 1,
    reputation: 0, // reputationScore({served:0, slashed:1})
    status: "SLASHED",
  },
];
