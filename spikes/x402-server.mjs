// Phase-0 x402 spike — SELLER (resource server).
// CDP hosted facilitator on Arbitrum One mainnet (eip155:42161), price $0.01 native USDC.
// CDP has no Arbitrum Sepolia support, hence mainnet (see CLAUDE.md locked-decision note).
import { config } from "dotenv";
config(); // spikes/.env (non-secret config: PAY_TO, PORT)
config({ path: new URL("../.env", import.meta.url) }); // root .env (shared secrets: CDP keys)
import express from "express";
import { facilitator } from "@coinbase/x402";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { HTTPFacilitatorClient } from "@x402/core/server";

const NET = "eip155:42161"; // Arbitrum One
const PAY_TO = process.env.PAY_TO; // address that receives the USDC (we control it)
const PORT = process.env.PORT || 4021;

if (!PAY_TO) {
  console.error("Set PAY_TO in .env (the seller payout address).");
  process.exit(1);
}

// `facilitator` from @coinbase/x402 carries the CDP url + auth headers built from
// CDP_API_KEY_ID / CDP_API_KEY_SECRET in the environment.
const facilitatorClient = new HTTPFacilitatorClient(facilitator);
const resourceServer = new x402ResourceServer(facilitatorClient).register(
  NET,
  new ExactEvmScheme(),
);

const app = express();
app.use(
  paymentMiddleware(
    {
      "GET /hello": {
        accepts: [{ scheme: "exact", price: "$0.01", network: NET, payTo: PAY_TO }],
        description: "Proof-of-Model phase-0 x402 hello-world",
        mimeType: "application/json",
      },
    },
    resourceServer,
  ),
);

app.get("/hello", (_req, res) => {
  res.json({ msg: "paid hello from proof-of-model", network: NET });
});

app.listen(PORT, () => console.log(`x402 seller on http://localhost:${PORT}/hello (network ${NET}, payTo ${PAY_TO})`));
