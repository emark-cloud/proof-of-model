### **Build resources**

**Verifiable-inference core (the intellectual stack)**

* Offchain Labs paper — [https://eprint.iacr.org/2026/541](https://eprint.iacr.org/2026/541) (PDF `/2026/541.pdf`); mirror [https://arxiv.org/pdf/2603.19025](https://arxiv.org/pdf/2603.19025)  
* Arbitrum Foundation framing — [https://blog.arbitrum.foundation/the-agent-economy-has-a-verification-problem/](https://blog.arbitrum.foundation/the-agent-economy-has-a-verification-problem/)  
* opML reference implementation — [https://github.com/ora-io/opml](https://github.com/ora-io/opml) and [https://github.com/OPML-Labs/opml](https://github.com/OPML-Labs/opml); docs at [https://docs.ora.io](https://docs.ora.io) (the optimistic-machine-learning-opml page); paper [https://arxiv.org/pdf/2401.17555](https://arxiv.org/pdf/2401.17555)  
* VeriLLM — [https://arxiv.org/html/2509.24257](https://arxiv.org/html/2509.24257)  
* zkML landscape (for the category-rejection contrast) — [https://arxiv.org/pdf/2503.22573](https://arxiv.org/pdf/2503.22573)

**Arbitrum \+ Stylus core** (from the brief)

* Docs hub [https://docs.arbitrum.io/](https://docs.arbitrum.io/) ; Stylus quickstart [https://docs.arbitrum.io/stylus/quickstart](https://docs.arbitrum.io/stylus/quickstart) ; gentle intro [https://docs.arbitrum.io/stylus/gentle-introduction](https://docs.arbitrum.io/stylus/gentle-introduction) ; local node [https://docs.arbitrum.io/run-arbitrum-node/run-nitro-dev-node](https://docs.arbitrum.io/run-arbitrum-node/run-nitro-dev-node) ; oracles map [https://docs.arbitrum.io/for-devs/oracles/oracles-content-map](https://docs.arbitrum.io/for-devs/oracles/oracles-content-map)  
* `cargo-stylus` [https://github.com/OffchainLabs/cargo-stylus](https://github.com/OffchainLabs/cargo-stylus) ; Rust SDK [https://github.com/OffchainLabs/stylus-sdk-rs](https://github.com/OffchainLabs/stylus-sdk-rs) ; Stylus By Example [https://stylus-by-example.org](https://stylus-by-example.org) ; OZ Rust contracts [https://github.com/OpenZeppelin/rust-contracts-stylus](https://github.com/OpenZeppelin/rust-contracts-stylus) ; Arbitrum SDK [https://github.com/OffchainLabs/arbitrum-sdk](https://github.com/OffchainLabs/arbitrum-sdk)

**The two reference repos that map directly onto your two hardest components** (from my report's source list)

* **StarkVerifier** — [https://github.com/hoddukzoa12/starkverifier](https://github.com/hoddukzoa12/starkverifier) — a Poseidon/Merkle verifier in Stylus *with a head-to-head Solidity gas benchmark*. This is the template for your Verifier contract **and** your benchmark deliverable.  
* **RayStylus** — [https://github.com/pramadanif/raystylus](https://github.com/pramadanif/raystylus) — a fixed-point (i64) on-chain neural net in Stylus. This is the template for your deterministic model \+ activation trace.

**Solidity glue \+ tooling**

* OZ Solidity contracts [https://github.com/OpenZeppelin/openzeppelin-contracts](https://github.com/OpenZeppelin/openzeppelin-contracts) ; Remix quickstart [https://docs.arbitrum.io/build-decentralized-apps/quickstart-solidity-remix](https://docs.arbitrum.io/build-decentralized-apps/quickstart-solidity-remix) ; Foundry (foundry-stylus support) or Hardhat; Arbiscan for verification

**Agent identity \+ payments**

* **ERC-8004** spec — [https://eips.ethereum.org/EIPS/eip-8004](https://eips.ethereum.org/EIPS/eip-8004) (live on Arbitrum as a per-chain singleton per my report; pull the registry address \+ reference implementation from the EIP before wiring identity/reputation)  
* **x402** — github [https://github.com/coinbase/x402](https://github.com/coinbase/x402) ; CDP facilitator docs [https://docs.cdp.coinbase.com/x402/welcome](https://docs.cdp.coinbase.com/x402/welcome). Confirmed relevant: the Coinbase-hosted facilitator processes ERC-20 payments on Base, Polygon, Arbitrum, World, and Solana — via EIP-3009 (USDC/EURC) or Permit2 — with a free tier of 1,000 tx/month, then $0.001/tx. Packages: `@coinbase/x402` (facilitator config), `x402-express` middleware, with a price/network config like `{ price: "$0.10", network: "base-sepolia" }`; EVM scheme via `@x402/evm`. If the CDP facilitator is awkward on Arbitrum testnet, there's a community-maintained open-source facilitator at x402.rs you can self-host. [Coinbase \+ 2](https://docs.cdp.coinbase.com/x402/welcome)

**Crypto/math building blocks for the Verifier** (verify WASM/Stylus compatibility before committing — this is the main unknown)

* Hashing: Keccak via the Stylus SDK host or `tiny-keccak`; Poseidon by adapting StarkVerifier (decision \#2 in the scope — Keccak is the simpler path, Poseidon is the better benchmark story)  
* Merkle-proof verification: model on StarkVerifier  
* Fixed-point arithmetic: follow RayStylus's i64 Q-format, or evaluate the `fixed` crate under WASM  
* Sampling randomness: Chainlink VRF on Arbitrum, or commit-reveal randomness (VeriLLM uses VRF)

**Testnet / RPC / faucets** (from the brief)

* Arbitrum Sepolia faucets: [https://arbitrum.faucet.dev/](https://arbitrum.faucet.dev/) , [https://faucet.quicknode.com/arbitrum/sepolia](https://faucet.quicknode.com/arbitrum/sepolia) , [https://www.l2faucet.com/arbitrum](https://www.l2faucet.com/arbitrum) ; USDC [https://faucet.circle.com/](https://faucet.circle.com/) ; Robinhood Chain [https://faucet.testnet.chain.robinhood.com/](https://faucet.testnet.chain.robinhood.com/)  
* RPC: [https://arb1.arbitrum.io/rpc](https://arb1.arbitrum.io/rpc) , [https://rpc.ankr.com/arbitrum](https://rpc.ankr.com/arbitrum) , [https://arbitrum.llamarpc.com](https://arbitrum.llamarpc.com)

**Frontend / spectator dashboard**

* wagmi \+ viem \+ RainbowKit \+ Next.js (the Plexi/RayStylus stack)


