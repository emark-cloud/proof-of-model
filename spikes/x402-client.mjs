// Phase-0 x402 spike — BUYER (paying client).
// Signs an EIP-3009 authorization for native USDC on Arbitrum One; the CDP facilitator
// settles on-chain and sponsors gas. Buyer needs USDC but no ETH.
import "dotenv/config";
import { privateKeyToAccount } from "viem/accounts";
import { wrapFetchWithPayment } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { x402HTTPClient } from "@x402/core/client";

const NET = "eip155:42161";
const URL = process.env.RESOURCE_URL || "http://localhost:4021/hello";
const PK = process.env.PRIVATE_KEY?.startsWith("0x")
  ? process.env.PRIVATE_KEY
  : `0x${process.env.PRIVATE_KEY}`;

const account = privateKeyToAccount(PK);
console.log("buyer:", account.address);

const client = new x402HTTPClient().register(NET, new ExactEvmScheme(account));
const fetchWithPayment = wrapFetchWithPayment(fetch, client);

const res = await fetchWithPayment(URL, { method: "GET" });
console.log("status:", res.status);
console.log("body:", await res.json());
const settle = res.headers.get("x-payment-response");
if (settle) console.log("settlement:", settle);
