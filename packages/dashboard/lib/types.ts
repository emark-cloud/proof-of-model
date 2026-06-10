/**
 * The data contract between the §2.2 presentational components (which render these
 * shapes) and the §2.3 live data layer (which fills them from watchContractEvent +
 * contract reads). Components take these as props and stay dumb — no chain access
 * inside a component. Keeping the seam here means §2.3 can swap the placeholder seed
 * (lib/demo-data.ts) for live data without touching a single component.
 */
import type { Address, Hex } from "viem";

/** Feed event vocabulary — design.md §4.3 / phase3-plan §1.1 (on-chain events only). */
export type FeedEventKind =
  | "PAYMENT" // Escrow.Deposited
  | "COMMIT" // ChallengeManager.Committed
  | "CHALLENGE" // ChallengeManager.ChallengeOpened
  | "VERIFY" // ChallengeManager.Verified(ok=true)
  | "SLASH" // ChallengeManager.Slashed (+ Verified(ok=false))
  | "BOUNTY" // ChallengeManager.BountyPaid
  | "FINALIZE"; // ChallengeManager.Finalized (+ Escrow.Released)

export interface FeedEvent {
  /** Stable de-dupe / React key — `${txHash}:${logIndex}`. */
  id: string;
  kind: FeedEventKind;
  /** Human narration line (design.md §4.3), pre-composed by the data layer. */
  message: string;
  txHash: Hex;
  blockNumber: bigint;
  /** Block timestamp (ms epoch). Undefined until the block header is fetched. */
  timestamp?: number;
  /** The request this event belongs to, when applicable. */
  requestId?: Hex;
}

/** Protocol stats bar — design.md §4.2 / phase3-plan §2.2.2. */
export interface ProtocolStats {
  /** Finalized + Slashed (every settled request). */
  totalInferences: number;
  /** ChallengeOpened count. */
  challengesFiled: number;
  /** Slashed / challengesFiled, in [0,1]; 0 when no challenges yet. */
  slashRate: number;
  /** Sum of Escrow.Released.amount (wei) — fees that reached providers. */
  totalFeesWei: bigint;
  /** Registry providers currently active. */
  activeProviders: number;
}

export type ProviderStatus = "ACTIVE" | "SLASHED";

/** One provider card — design.md §4.4, hydrated from Registry.providers(addr). */
export interface ProviderCardData {
  address: Address;
  /** Cosmetic label (PROVIDER_A/PROVIDER_B); the address is the source of truth. */
  label: string;
  /** Committed model hash H_w — both providers advertise the SAME one (the point). */
  weightRoot: Hex;
  stakeWei: bigint;
  served: number;
  challenged: number;
  slashed: number;
  /** Derived [0,100] score — see lib/reputation.ts. Not on-chain. */
  reputation: number;
  status: ProviderStatus;
}
