/**
 * Typed contract handles — ABIs + addresses from @proof/shared (single source of
 * truth; NO hand-copied ABIs). Each handle is the `{ address, abi }` shape wagmi's
 * read/watch hooks expect, resolved for the active chain (lib/chain.ts).
 *
 * Read-only surface (CLAUDE.md invariant): the dashboard never writes. Addresses
 * may be null on a not-yet-deployed chain (Arbitrum One pre-migrate) — components
 * must guard with `isDeployed` before subscribing.
 */
import type { Abi, Address } from "viem";
import { addresses } from "./chain";

import RegistryAbiJson from "@proof/shared/abis/Registry.json";
import ChallengeManagerAbiJson from "@proof/shared/abis/ChallengeManager.json";
import EscrowAbiJson from "@proof/shared/abis/Escrow.json";
import VerifierAbiJson from "@proof/shared/abis/IVerifier.json";

export const registryAbi = RegistryAbiJson as Abi;
export const challengeManagerAbi = ChallengeManagerAbiJson as Abi;
export const escrowAbi = EscrowAbiJson as Abi;
export const verifierAbi = VerifierAbiJson as Abi;

export interface ContractHandle {
  address: Address | null;
  abi: Abi;
}

export const registry: ContractHandle = {
  address: (addresses.Registry as Address | null) ?? null,
  abi: registryAbi,
};
export const challengeManager: ContractHandle = {
  address: (addresses.ChallengeManager as Address | null) ?? null,
  abi: challengeManagerAbi,
};
export const escrow: ContractHandle = {
  address: (addresses.Escrow as Address | null) ?? null,
  abi: escrowAbi,
};
export const verifier: ContractHandle = {
  address: (addresses.Verifier as Address | null) ?? null,
  abi: verifierAbi,
};

export const contracts = { registry, challengeManager, escrow, verifier } as const;

/** True only when every consumed contract has a deployed address on the active chain. */
export const isDeployed: boolean = Boolean(
  registry.address && challengeManager.address && escrow.address,
);
