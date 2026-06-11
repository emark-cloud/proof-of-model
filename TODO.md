# Proof-of-Model — TODO

Status legend: [ ] todo · [~] in progress · [x] done · [!] blocked

## Phase 0 — De-risk (do first)
- [x] Read Offchain-Labs-paper.pdf (eprint 2026/541); confirm trace-commit + spot-check model; correct plan if needed → see phase0-paper-review.md (RandPathTest correction)
- [x] Spike: Poseidon compiles + runs under Stylus/WASM → GO. Real arkworks/light-poseidon BN254 deployed+activated on Sepolia (0x299c9ba8…64f8), on-chain==circom oracle 3/3, ~110k gas. See phase0-spike-results.md
- [x] Spike: x402 CDP facilitator (hello-world paid endpoint) — **GO. Live on-chain settlement on Arbitrum One** (tx `0xaa38f38a…d3a6`, block 471967645): paid `GET /hello` → 200, buyer `0x2a30…05B6A` signs EIP-3009, CDP facilitator settles + sponsors gas (buyer gasless), 0.02 USDC → provider `0xe6Fd…E6bC`. Fixed 2 client bugs (`x402HTTPClient`→`x402Client`, `URL` shadow) + 2 run gotchas (Coinbase API egress → Proton WG tunnel; `self_send_not_allowed` → `PAY_TO != buyer`). Turnkey: `node x402-server.mjs` + `node x402-client.mjs`. See phase0-spike-results.md. CDP has NO Arbitrum Sepolia support — rail is Arbitrum One.
- [x] Decide go/no-go on Poseidon (else Keccak fallback) and x402 (else escrow / self-host fallback) → both GO; locked in CLAUDE.md

## Phase 0.5 — Repo scaffold
- [x] pnpm workspace + packages (model, stylus, contracts, agents, dashboard, shared). pnpm-workspace.yaml + root build/test scripts; git init'd; `pnpm build:ts` + tests green (shared 5, model 1, agents 1)
- [x] Foundry init (contracts: forge-std via soldeer, Registry+IVerifier skeleton, `forge test` 2/2 pass, Deploy.s.sol), Next.js 14 init (dashboard: read-only spectator, `next build` OK), cargo-stylus scaffold (stylus: Verifier+fixed.rs mirroring proven Phase-0 spike; cargo + wasm32 target confirmed available locally)
- [x] shared: fixed-point Q47.16 (i64 storage, i128 accumulator, ReLU/identity) + Poseidon params (BN254 t=3, circom-compatible) + 3 golden hash vectors, network shape (3→8→4→2), chains+addresses — single source of truth, mirrored in stylus/src/fixed.rs
- [x] CI: `.github/workflows/ci.yml` (ts build+test+dashboard / foundry build+test / stylus cargo test + stylus check); `scripts/sync-abis.ts` copies forge ABIs → packages/shared/src/abis (Registry, IVerifier), CI fails if stale

## Phase 1 — Reference model + verifier core
- [x] model: deterministic 3→8→4→2 fixed-point net (matches Q-format in shared)
- [x] model: activation trace + Poseidon-Merkle root R; weight root H_w
- [x] model: openPath(ρ) → proof bundle (per node on the output→input path: activation, weight row+bias, full parent-layer acts, Merkle paths)
- [x] model: golden known-good + known-bad fixtures
- [x] stylus: Merkle-proof verification (Poseidon)
- [x] stylus: per-node fixed-point recompute looped along the sampled path + assert equality → PASS/FAIL
- [x] stylus: unit tests vs golden fixtures
- [x] stylus: deploy Verifier to Arbitrum Sepolia (0xd46e05f62b3a384bcf585f3c0247df080af8a057)
- [x] contracts: Registry + Staking (ERC-8004-style, register H_w + stake + reputation)
- [x] contracts: ChallengeManager + Escrow skeletons (compile, forge test 17/17, ABIs synced)
- [x] contracts: deploy skeleton to Sepolia (Registry 0x94B1…Ec9, ChallengeManager 0x514C…f30, Escrow 0x4304…3DC)

## Phase 2 — Agents + money loop + challenge game
- [x] agents/provider: serve inference, commit R + output on-chain, serve openings
- [x] agents/provider: cheat-mode flag (corrupt one neuron on command)
- [x] agents/buyer: per-inference payment → on-chain receipt — escrow rail (Sepolia spine);
      x402 wired behind `rail=x402|escrow` flag, live-run deferred to Phase-3 One migrate
- [x] contracts: Escrow/Fee (per-request receipt + protocol cut, 5%; refund-on-slash)
- [x] contracts: ChallengeManager (finalize window 30s; challenge → call Verifier → slash + bounty)
- [x] agents/challenger: sample → demand opening → call Verifier → submit challenge → earn bounty
- [x] E2E happy path on Sepolia (honest provider PASS, fee released) with real tx hashes — `phase2-runlog.md`
- [x] E2E cheat path on Sepolia (cheater FAIL → slash + bounty + refund) with real tx hashes — `phase2-runlog.md`

## Phase 3 — Dashboard + deliverables + migrate
- [x] dashboard: scaffold (Next.js 14, wagmi/viem, RainbowKit, Tailwind, Framer Motion, design tokens) — deps + Tailwind tokens (design.md §2) + `app/providers.tsx` (Wagmi/RainbowKit/QueryClient, `NEXT_PUBLIC_CHAIN`-driven) + `lib/{chain,contracts}.ts` (typed handles from @proof/shared) + next/font; `typecheck` + `next build` green
- [x] dashboard: header + protocol stats bar — `components/{Header,StatsBar,CountUp}.tsx`, design.md §4.1/§4.2 (network badge from `lib/chain`, muted RainbowKit connect, Framer count-up). Data via typed props (`lib/types.ts` = the §2.2↔§2.3 seam); fed the placeholder seed for now, §2.3 swaps in live aggregates
- [x] dashboard: live event feed (SLASH red glow, PASS green pulse, tx links to Arbiscan) — `components/EventFeed.tsx` + `lib/feed-meta.ts` (§1.1 on-chain-event mapping), reverse-chron rows, Framer slide-in, Arbiscan tx links
- [x] dashboard: provider cards (both same H_w; one thrives, one slashed) — `components/ProviderCards.tsx`, derived reputation bar (`lib/reputation.ts`, §1.3), ACTIVE/SLASHED pulsing badge, shared `H_w` on both. Seed = real Phase-2 runlog counters (`lib/demo-data.ts`); `typecheck` + `next build` + static prerender green
- [~] dashboard: wire watchContractEvent + poll fallback; deploy to Vercel (§2.3)
  - [x] live data layer — `lib/useProtocolData.ts`: backfill (`getContractEvents` from `DEPLOY_BLOCK` 275521000, added to `@proof/shared`), live `watchContractEvent` (http→polls ~4s = the poll fallback), `Registry.providers` reads → cards, stats from events, `useBlockNumber` connection dot. `lib/events.ts` = §1.1 on-chain-event→FeedEvent mapping. `LiveDashboard.tsx` wires it (seed fallback pre-migrate). Verified against the real Sepolia chain: backfill+decode+reads reproduce the seed state exactly (2 inferences, 1 challenge, 100% slash, 0.000019 ETH fees; honest ACTIVE, cheat SLASHED, shared H_w). `typecheck` + `next build` green
  - [x] `scripts/demo-driver.ts` (§2.3.5 / §1.2): continuous honest cadence + cheat-every-Nth → SLASH; `pnpm demo:driver`
  - [ ] Vercel deploy — prepared (`vercel.json` + `DEPLOY.md`: root dir, build builds `@proof/shared` first, envs); actual `vercel --prod` + public URL is the remaining manual step (needs your Vercel auth)
- [x] scripts/verify.ts: one-command judge path (bytecode + slashed state + SLASHED event + bounty → PASS) — `--chain sepolia|one`; verified live on Sepolia (prints PASS against `0xe429…fac4`)
- [x] ~~scripts/benchmark: Stylus-vs-Solidity gas table for verify~~ **DROPPED** — built `VerifierSol.sol` (Poseidon via assembly-optimized `poseidon-solidity`, golden-vector + fixture parity), deployed + measured on Sepolia: Stylus 3.70M vs Solidity 3.78M = **~2% parity, no honest gas-win** → not a deliverable (CLAUDE.md: no manufactured wins). See `phase3-plan.md` §1.4/§2.5. Build reverted; testnet deploys orphaned (harmless).
- [x] docs: honesty-table, category-rejection paragraph, README, demo script — `README.md` + `DEMO.md`; reconciled 2026-06-11 to ship escrow-on-Sepolia as the demonstrated rail, x402/One as roadmap
- [x] ~~Migrate/redeploy to Arbitrum One~~ **DESCOPED 2026-06-11** — decision: skip the mainnet migrate, ship the product complete on Sepolia. The stack was made One-ready (`PROOF_CHAIN`/`NEXT_PUBLIC_CHAIN` single-flip, lazy `CONTRACTS`, One RPC wired) but the deploy is left for a funded session (deployer had ~0.00086 ETH vs ~0.005–0.01 needed; x402 also needs buyer USDC + WG tunnel). x402-on-One stays roadmap (proven in the Phase-0 spike). See `phase3-plan.md` §2.7.
- [ ] Record demo (one mechanic per sentence); buffer

## Stretch (only after the spine works)
- [ ] dashboard: event detail drawer (neuron coords, expected vs actual, Merkle path, gas badge)
- [ ] dashboard: SLASH sound effect; auto-scroll pause-on-hover
- [x] ~~Poseidon benchmark hardening~~ — moot (benchmark dropped, see above)
