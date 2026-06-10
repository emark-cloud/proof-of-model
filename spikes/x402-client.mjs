// Phase-0 x402 spike — BUYER (paying client).
// Signs an EIP-3009 authorization for native USDC on Arbitrum One; the CDP facilitator
// settles on-chain and sponsors gas. Buyer needs USDC but no ETH.
import { config } from "dotenv";
config(); // spikes/.env (non-secret config: RESOURCE_URL)
config({ path: new URL("../.env", import.meta.url) }); // root .env (shared secrets: buyer key)
import { privateKeyToAccount } from "viem/accounts";
import { wrapFetchWithPayment, decodePaymentResponseHeader } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { x402Client } from "@x402/core/client";

const NET = "eip155:42161";
const RESOURCE_URL = process.env.RESOURCE_URL || "http://localhost:4021/hello";
const PK_RAW = process.env.PRIVATE_KEY || process.env.DEPLOYER_KEY; // self-pay: deployer wallet holds the USDC
if (!PK_RAW) {
  console.error("Set PRIVATE_KEY (or DEPLOYER_KEY) in .env (the buyer wallet).");
  process.exit(1);
}
const PK = PK_RAW.startsWith("0x") ? PK_RAW : `0x${PK_RAW}`;

const account = privateKeyToAccount(PK);
console.log("buyer:", account.address);

const client = new x402Client().register(NET, new ExactEvmScheme(account));
const fetchWithPayment = wrapFetchWithPayment(fetch, client);

const res = await fetchWithPayment(RESOURCE_URL, { method: "GET" });
console.log("status:", res.status);
console.log("body:", await res.json());
// v2 facilitator returns the on-chain settlement in the PAYMENT-RESPONSE header (base64 JSON).
const settle = res.headers.get("PAYMENT-RESPONSE") || res.headers.get("X-PAYMENT-RESPONSE");
if (settle) {
  const s = decodePaymentResponseHeader(settle);
  console.log("settlement:", JSON.stringify(s));
  if (s.transaction) console.log("arbiscan:", `https://arbiscan.io/tx/${s.transaction}`);
}
