/**
 * chain.ts — shared chain access for the three agents (§1.5 of phase2-plan.md).
 *
 * One place for: the viem public client (Arbitrum Sepolia), per-identity wallet
 * clients, the deployed contract addresses + ABIs (from @proof/shared, the single
 * source of truth), and the pure helpers that bind money + commitment to a
 * `requestId`. Everything the provider / buyer / challenger touch on-chain goes
 * through here so the cross-language invariants stay in one spot.
 */
import { createPublicClient, createWalletClient, http, keccak256, encodePacked, toHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arbitrumSepolia } from "viem/chains";
import type { Abi, Address, Hex, PublicClient, WalletClient, Account } from "viem";

import {
  ADDRESSES,
  feltFromFixed,
  poseidonMany,
  type Fixed,
} from "@proof/shared";

import RegistryAbiJson from "@proof/shared/abis/Registry.json" with { type: "json" };
import ChallengeManagerAbiJson from "@proof/shared/abis/ChallengeManager.json" with { type: "json" };
import EscrowAbiJson from "@proof/shared/abis/Escrow.json" with { type: "json" };
import VerifierAbiJson from "@proof/shared/abis/IVerifier.json" with { type: "json" };

// ─── ABIs ───────────────────────────────────────────────────────────────────
export const registryAbi = RegistryAbiJson as Abi;
export const challengeManagerAbi = ChallengeManagerAbiJson as Abi;
export const escrowAbi = EscrowAbiJson as Abi;
export const verifierAbi = VerifierAbiJson as Abi;

// ─── Addresses (Arbitrum Sepolia) ─────────────────────────────────────────────
function required(addr: Address | null, name: string): Address {
  if (!addr) throw new Error(`chain: ADDRESSES.arbitrumSepolia.${name} is not deployed`);
  return addr;
}

const dep = ADDRESSES.arbitrumSepolia;
export const CONTRACTS = {
  Verifier: required(dep.Verifier as Address | null, "Verifier"),
  Registry: required(dep.Registry as Address | null, "Registry"),
  ChallengeManager: required(dep.ChallengeManager as Address | null, "ChallengeManager"),
  Escrow: required(dep.Escrow as Address | null, "Escrow"),
} as const;

// ─── Demo economics ───────────────────────────────────────────────────────────
/** Provider stake bonded on registration — must be ≥ Registry.MIN_STAKE (0.001 ether). */
export const STAKE = 1_000_000_000_000_000n; // 0.001 ETH
/** Per-inference fee the buyer escrows. Small, well below stake. */
export const FEE = 20_000_000_000_000n; // 0.00002 ETH

// ─── Clients ──────────────────────────────────────────────────────────────────
export const chain = arbitrumSepolia;

/** Public (read / eth_call / event) client. RPC override via SEPOLIA_RPC_URL. */
export const publicClient: PublicClient = createPublicClient({
  chain,
  transport: http(process.env.SEPOLIA_RPC_URL),
});

export interface Identity {
  account: Account;
  wallet: WalletClient;
  address: Address;
}

/** Build a wallet client + account for one agent identity from its private key. */
export function makeIdentity(privateKey: string): Identity {
  const pk = (privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`) as Hex;
  const account = privateKeyToAccount(pk);
  const wallet = createWalletClient({ account, chain, transport: http(process.env.SEPOLIA_RPC_URL) });
  return { account, wallet, address: account.address };
}

/** Read a required private key from the environment (dotenv-loaded by the caller). */
export function loadEnvKey(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`chain: missing env key ${name} (see .env.example)`);
  return v;
}

// ─── Pure helpers (no network — unit-testable) ────────────────────────────────

/**
 * A field-element root (bigint) as a 32-byte big-endian hex word — the form the
 * contracts and Stylus verifier expect for `traceRoot` / `weightRoot`. The BN254
 * field modulus < 2^254, so every root fits in 32 bytes.
 */
export function feltToBytes32(felt: bigint): Hex {
  return toHex(felt, { size: 32 });
}

/**
 * The canonical `requestId` binding one buyer ↔ provider ↔ nonce (§1.1). Computed
 * off-chain and agreed by all parties; every on-chain step keys off it.
 */
export function requestIdOf(buyer: Address, provider: Address, nonce: bigint): Hex {
  return keccak256(encodePacked(["address", "address", "uint256"], [buyer, provider, nonce]));
}

/**
 * Binding hash of the served output vector — stored on-chain as the commitment's
 * `outputHash` so the output is non-repudiable. Poseidon over the felt-encoded
 * output, consistent with the project's hash choice (opaque to the verifier).
 */
export function outputHashOf(output: Fixed[]): Hex {
  return feltToBytes32(poseidonMany(output.map(feltFromFixed)));
}

/** Uint8Array → 0x-hex (for the encoded pathProof on the wire / in calldata). */
export function bytesToHex(bytes: Uint8Array): Hex {
  return toHex(bytes);
}
