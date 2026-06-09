/**
 * Challenger agent (§2.2.3). Reads a provider's on-chain commitment, samples K
 * independent output→input paths, asks the provider to open each, and uses
 * `eth_call verifyPath` against the deployed Stylus Verifier as a free local
 * oracle (no 4th reimplementation of verify — §1.4). On the first failing path it
 * opens + resolves a challenge on-chain: slash full stake, 10% bounty, buyer refund.
 *
 * "Multi-sample" lives HERE, not in the contract: per-path detection is ~1/N, so K
 * paths drive it up. Honest provider ⇒ every path passes ⇒ no challenge. Cheat ⇒ a
 * path through the corrupt node fails ⇒ slash.
 */
import { keccak256, encodePacked } from "viem";
import type { Address, Hex } from "viem";

import { samplePath, type PathSpec } from "@proof/model";

import {
  publicClient,
  makeIdentity,
  CONTRACTS,
  registryAbi,
  challengeManagerAbi,
  verifierAbi,
} from "./chain.js";

/** Default number of independent paths sampled; (7/8)^64 ≈ 0 chance of missing a one-node cheat. */
const DEFAULT_SAMPLES = 64;

/** Derive the k-th path seed from on-chain data (deterministic, unpredictable to the provider). */
export function deriveSeed(requestId: Hex, traceRoot: Hex, challenger: Address, k: number): bigint {
  return BigInt(
    keccak256(
      encodePacked(["bytes32", "bytes32", "address", "uint256"], [requestId, traceRoot, challenger, BigInt(k)])
    )
  );
}

export interface CheatSearch {
  requestId: Hex;
  traceRoot: Hex;
  weightRoot: Hex;
  challenger: Address;
  samples: number;
  /** Ask the provider to open a sampled path → encoded pathProof hex. */
  open: (spec: PathSpec) => Promise<Hex>;
  /** Verify a path (eth_call verifyPath, or a mock in tests) → PASS/FAIL. */
  verify: (traceRoot: Hex, weightRoot: Hex, pathProof: Hex) => Promise<boolean>;
}

export interface CheatResult {
  found: boolean;
  spec?: PathSpec;
  pathProof?: Hex;
  sampleIndex?: number;
}

/**
 * The multi-sample search (pure — open/verify are injected, so testable offline).
 * Returns on the FIRST path that the verifier rejects; otherwise found=false.
 */
export async function findCheatPath(s: CheatSearch): Promise<CheatResult> {
  for (let k = 0; k < s.samples; k++) {
    const spec = samplePath(deriveSeed(s.requestId, s.traceRoot, s.challenger, k));
    const pathProof = await s.open(spec);
    const ok = await s.verify(s.traceRoot, s.weightRoot, pathProof);
    if (!ok) return { found: true, spec, pathProof, sampleIndex: k };
  }
  return { found: false };
}

export interface ChallengerConfig {
  /** Funded Sepolia private key for the challenger identity. */
  privateKey: string;
  /** Independent paths to sample per commitment. */
  samples?: number;
}

export interface InspectResult {
  provider: Address;
  traceRoot: Hex;
  weightRoot: Hex;
  cheated: boolean;
  sampleIndex?: number;
  pathProof?: Hex;
}

export interface ChallengeReceipt {
  openChallengeTx: Hex;
  resolveTx: Hex;
}

export interface ChallengerHandle {
  address: Address;
  /** Read-only: sample paths and learn PASS/FAIL via eth_call. No state change. */
  inspect(requestId: Hex, providerUrl: string): Promise<InspectResult>;
  /** State-changing: open + resolve a challenge with a failing path's proof. */
  challenge(requestId: Hex, pathProof: Hex): Promise<ChallengeReceipt>;
  /** inspect → challenge if a cheat is found; otherwise leave it to finalize. */
  run(requestId: Hex, providerUrl: string): Promise<InspectResult & Partial<ChallengeReceipt>>;
}

export function createChallenger(config: ChallengerConfig): ChallengerHandle {
  const samples = config.samples ?? DEFAULT_SAMPLES;
  const id = makeIdentity(config.privateKey);

  // Free local oracle: the deployed Stylus Verifier via eth_call.
  const verify = async (traceRoot: Hex, weightRoot: Hex, pathProof: Hex): Promise<boolean> =>
    (await publicClient.readContract({
      address: CONTRACTS.Verifier,
      abi: verifierAbi,
      functionName: "verifyPath",
      args: [traceRoot, weightRoot, pathProof],
    })) as boolean;

  async function readCommitment(requestId: Hex): Promise<{ provider: Address; traceRoot: Hex }> {
    const c = (await publicClient.readContract({
      address: CONTRACTS.ChallengeManager,
      abi: challengeManagerAbi,
      functionName: "commitments",
      args: [requestId],
    })) as readonly [Address, Hex, Hex, bigint, Address, number];
    return { provider: c[0], traceRoot: c[1] };
  }

  async function inspect(requestId: Hex, providerUrl: string): Promise<InspectResult> {
    const { provider, traceRoot } = await readCommitment(requestId);
    const weightRoot = (await publicClient.readContract({
      address: CONTRACTS.Registry,
      abi: registryAbi,
      functionName: "weightRootOf",
      args: [provider],
    })) as Hex;

    const open = async (spec: PathSpec): Promise<Hex> => {
      const res = await fetch(`${providerUrl}/open`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ requestId, spec }),
      });
      if (!res.ok) throw new Error(`/open failed: ${res.status} ${await res.text()}`);
      return ((await res.json()) as { pathProof: Hex }).pathProof;
    };

    const result = await findCheatPath({
      requestId,
      traceRoot,
      weightRoot,
      challenger: id.address,
      samples,
      open,
      verify,
    });

    return {
      provider,
      traceRoot,
      weightRoot,
      cheated: result.found,
      sampleIndex: result.sampleIndex,
      pathProof: result.pathProof,
    };
  }

  async function challenge(requestId: Hex, pathProof: Hex): Promise<ChallengeReceipt> {
    const openChallengeTx = await id.wallet.writeContract({
      address: CONTRACTS.ChallengeManager,
      abi: challengeManagerAbi,
      functionName: "openChallenge",
      args: [requestId],
      account: id.account,
      chain: id.wallet.chain,
    });
    await publicClient.waitForTransactionReceipt({ hash: openChallengeTx });

    const resolveTx = await id.wallet.writeContract({
      address: CONTRACTS.ChallengeManager,
      abi: challengeManagerAbi,
      functionName: "resolveChallenge",
      args: [requestId, pathProof],
      account: id.account,
      chain: id.wallet.chain,
    });
    await publicClient.waitForTransactionReceipt({ hash: resolveTx });

    return { openChallengeTx, resolveTx };
  }

  async function run(requestId: Hex, providerUrl: string) {
    const insp = await inspect(requestId, providerUrl);
    if (!insp.cheated || !insp.pathProof) return insp;
    const receipt = await challenge(requestId, insp.pathProof);
    return { ...insp, ...receipt };
  }

  return { address: id.address, inspect, challenge, run };
}
