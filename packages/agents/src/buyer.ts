/**
 * Buyer agent (§2.2.2). Pays per inference, then calls the provider's `/infer`.
 *
 *   rail="escrow" (default, Sepolia): Escrow.deposit(requestId){value: fee} —
 *     the on-chain money spine. Refundable if the provider is later slashed.
 *   rail="x402" (Arbitrum One, DEFERRED): EIP-3009 USDC settle via the CDP
 *     facilitator (lifted from spikes/). Direct-settles to the provider, so it has
 *     NO fee-refund-on-slash — the deterrent there is the stake slash + bounty.
 *
 * The buyer never trusts the returned `output`/`traceRoot`; soundness comes from
 * the challenger re-deriving the path check on-chain against the committed root.
 */
import type { Address, Hex } from "viem";

import { makeIdentity, publicClient, CONTRACTS, escrowAbi, FEE, requestIdOf } from "./chain.js";

export type Rail = "escrow" | "x402";

export interface BuyerConfig {
  /** Funded Sepolia private key for the buyer identity. */
  privateKey: string;
  /** Payment rail. Default "escrow" (Sepolia). "x402" runs the deferred One path. */
  rail?: Rail;
  /** Per-inference fee. Defaults to the shared demo FEE. */
  fee?: bigint;
}

export interface BuyParams {
  providerUrl: string;
  providerAddress: Address;
  input: number[];
  /** Unique nonce binding this request; auto-generated if omitted. */
  nonce?: bigint;
  fee?: bigint;
}

export interface BuyResult {
  requestId: Hex;
  nonce: bigint;
  output: number[];
  traceRoot: Hex;
  outputHash: Hex;
  /** Escrow deposit tx hash (escrow rail) or x402 settlement header (x402 rail). */
  receipt: string;
  commitTx: Hex;
}

export interface BuyerHandle {
  address: Address;
  rail: Rail;
  buy(params: BuyParams): Promise<BuyResult>;
}

/** Monotonic nonce source for a buyer process (unique per request). */
let _nonceSeed = BigInt(Date.now()) * 1_000_000n;
function nextNonce(): bigint {
  return _nonceSeed++;
}

export function createBuyer(config: BuyerConfig): BuyerHandle {
  const rail: Rail = config.rail ?? "escrow";
  const id = makeIdentity(config.privateKey);
  const defaultFee = config.fee ?? FEE;

  async function buy(params: BuyParams): Promise<BuyResult> {
    const fee = params.fee ?? defaultFee;
    const nonce = params.nonce ?? nextNonce();
    const requestId = requestIdOf(id.address, params.providerAddress, nonce);

    let receipt: string;
    if (rail === "escrow") {
      const depositTx = await id.wallet.writeContract({
        address: CONTRACTS.Escrow,
        abi: escrowAbi,
        functionName: "deposit",
        args: [requestId],
        value: fee,
        account: id.account,
        chain: id.wallet.chain,
      });
      await publicClient.waitForTransactionReceipt({ hash: depositTx });
      receipt = depositTx;
    } else {
      // x402 rail — DEFERRED to the Phase-3 Arbitrum One migrate (needs a funded
      // USDC wallet). Lifts the proven spike; not exercised in the Sepolia E2E.
      receipt = await x402Pay(config.privateKey, params.providerUrl, params.input);
    }

    const res = await fetch(`${params.providerUrl}/infer`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ input: params.input, requestId }),
    });
    if (!res.ok) throw new Error(`/infer failed: ${res.status} ${await res.text()}`);
    const data = (await res.json()) as {
      requestId: Hex;
      output: number[];
      traceRoot: Hex;
      outputHash: Hex;
      commitTx: Hex;
    };

    return {
      requestId,
      nonce,
      output: data.output,
      traceRoot: data.traceRoot,
      outputHash: data.outputHash,
      commitTx: data.commitTx,
      receipt,
    };
  }

  return { address: id.address, rail, buy };
}

/**
 * x402 payment (Arbitrum One). Wraps fetch with an EIP-3009 signer per the spike;
 * returns the `x-payment-response` settlement header. Dynamically imported so the
 * Sepolia escrow path carries no hard dependency on the x402 stack at runtime.
 */
async function x402Pay(privateKey: string, providerUrl: string, input: number[]): Promise<string> {
  const pk = (privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`) as Hex;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { privateKeyToAccount } = (await import("viem/accounts")) as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { wrapFetchWithPayment } = (await import("@x402/fetch")) as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { ExactEvmScheme } = (await import("@x402/evm/exact/client")) as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { x402HTTPClient } = (await import("@x402/core/client")) as any;

  const account = privateKeyToAccount(pk);
  const client = new x402HTTPClient().register("eip155:42161", new ExactEvmScheme(account));
  const fetchWithPayment = wrapFetchWithPayment(fetch, client);

  const res = await fetchWithPayment(`${providerUrl}/infer`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ input }),
  });
  return res.headers.get("x-payment-response") ?? "";
}
