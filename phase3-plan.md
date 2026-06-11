# Phase 3 — Dashboard + deliverables + migrate (implementation plan)

Status: planning. Owner: —. Target: Week 3 (Days 12–21, per `spec.md` milestones).

Phase 3 turns the working Phase-2 economic spine (the two reproducible Sepolia E2E runs —
honest PASS, cheat SLASH) into the **demo-day surface**: a read-only spectator dashboard that
renders the game live, a one-command judge path, the honesty docs, and the migrate to Arbitrum
One (incl. the deferred x402 live-run). *(The Stylus-vs-Solidity gas benchmark was scoped here
too but is now **dropped** — built, measured at ~2% parity, no honest gas-win; see §1.4/§2.5.)*

Nothing in Phase 3 changes protocol semantics. The contracts, the Stylus Verifier, the TS
reference model, and the agents are **finished inputs**; Phase 3 *observes* them (events +
reads) and *packages* them (docs, judge path, mainnet deploy). The one genuinely new build is the
**dashboard** (`packages/dashboard`), today a static Phase-0.5 landing page.

The phase ends with a **public Vercel URL** showing live green/red outcomes, a `verify.ts`
that prints **PASS** in ~60s, and the system **redeployed to Arbitrum One** with x402 settling a
real buyer→provider payment.

---

## 0. What already exists (Phase 0/1/2 — do not rebuild)

- **`packages/shared`** — `CHAINS` (Sepolia + One), `ADDRESSES.arbitrumSepolia` filled
  (Verifier `0xe19d…79ae`, Registry `0x3519…711b`, ChallengeManager `0xc313…96A3`,
  Escrow `0x6149…53cd`), `ADDRESSES.arbitrumOne` still **all `null`** (Phase-3 migrate fills it).
  Synced `abis/` for Registry, IVerifier, ChallengeManager, Escrow — the dashboard's typed
  contract surface. `network.ts` (`LAYER_SIZES`, `MAX_WIDTH`, `PATH_LENGTH`).
- **`packages/contracts`** — deployed + tested on Sepolia. **Events the dashboard consumes**
  (already emitted, no contract change needed):
  - `ChallengeManager`: `Committed(requestId, provider, traceRoot, outputHash, committedAt)`,
    `Finalized(requestId, provider)`, `ChallengeOpened(requestId, challenger, …)`,
    `Verified(requestId, ok)`, `Slashed(requestId, provider, amount, challenger)`,
    `BountyPaid(requestId, challenger, amount)`.
  - `Escrow`: `Deposited(requestId, buyer, amount)`, `Released(requestId, provider, amount,
    protocolCut)`, `Refunded(requestId, buyer, amount)`.
  - `Registry`: `ProviderRegistered(provider, weightRoot, stake)`, `ProviderWithdrew`, `ManagerSet`.
  - **Reads for provider cards**: `Registry.providers(addr)` (stake + `served/challenged/slashed`
    counters), `weightRootOf(addr)`, `stakeOf`/`isActive` getters.
- **`packages/agents`** — `provider` (honest+cheat HTTP services), `buyer` (escrow rail live;
  x402 wired behind `rail` flag), `challenger` (multi-sample → `eth_call` → challenge), `chain.ts`
  (viem clients). These are the **event generators** the dashboard renders — Phase 3 adds a
  *continuous demo driver* on top, it does not modify the agents.
- **`scripts/`** — `seed.ts`, `e2e-happy.ts`, `e2e-cheat.ts` (print every tx hash + Arbiscan
  link; the seed of `verify.ts`), `fund-check.ts`, `fund.ts`, `_env.ts`, `_onchain.ts`,
  `sync-abis.ts`. `phase2-runlog.md` has the real Sepolia tx hashes + the 4 demo accounts.
- **`packages/dashboard`** — Next.js 14 **static scaffold only**: `app/{layout,page,globals.css}`,
  read-only landing page importing `@proof/shared`. **No wagmi/viem/RainbowKit/Tailwind/Framer
  Motion yet.** `next build` is green. This is the bulk of Phase-3 net-new code.
- **`spikes/`** — proven x402 client+server (`@x402` v2 + `@coinbase/x402` facilitator, Arbitrum
  One `eip155:42161`); live settlement already demonstrated in Phase 0 (tx `0xaa38…d3a6`). The
  Phase-3 x402 live-run wires this rail through `buyer.ts` against the One deploy.

### Known environment constraints (shape the plan)

- **`cargo` IS available in this env** (corrected — `phase2-plan.md` predates this). `rustc`/
  `cargo` 1.96.0 + `cargo-stylus` 0.10.7 + the `wasm32-unknown-unknown` target are installed at
  `~/.cargo/bin`, and `cargo check --release` compiles `packages/stylus` cleanly. So the Stylus
  Verifier **can** be rebuilt and redeployed here — the Arbitrum One Stylus redeploy (§2.7) runs
  in-env (no external box), and the benchmark (§2.5) can build a fresh wasm if needed (though
  measuring the already-deployed verifier is still simpler). A One redeploy still needs a funded
  mainnet deployer key.
- **x402 live-run needs a funded mainnet wallet** (~$1–2 native USDC) and the Proton WG tunnel
  for Coinbase egress + `PAY_TO != buyer` (per memory `project_x402_run_prereqs`). Off the
  dashboard critical path; bundled into the migrate.
- **Vercel deploy** needs the dashboard to read a **public RPC** (no private keys client-side —
  it is read-only by invariant).

---

## 1. Design decisions to lock in Phase 3

### 1.1 Dashboard data model — events are the source of truth, reads hydrate the cards

The dashboard is **read-only** (CLAUDE.md invariant — no tx-sending, no "Submit Challenge"
button, optional wallet connect only). Two data channels:

1. **Live event feed** ← `watchContractEvent` on the three contracts, merged into one
   reverse-chronological stream. Map on-chain events → design.md's event vocabulary:

   | design.md event | on-chain source | color | drama |
   |---|---|---|---|
   | PAYMENT | `Escrow.Deposited` | cyan | — |
   | COMMIT | `ChallengeManager.Committed` | white | — |
   | CHALLENGE | `ChallengeManager.ChallengeOpened` | amber | — |
   | VERIFY (pass) | `ChallengeManager.Verified(ok=true)` | green | green pulse |
   | SLASH | `ChallengeManager.Slashed` (+ `Verified(ok=false)`) | red | **full-width red glow** |
   | BOUNTY | `ChallengeManager.BountyPaid` | green | — |
   | FINALIZE | `ChallengeManager.Finalized` (+ `Escrow.Released`) | dim | — |

   > Honesty note: design.md's `REQUEST`/per-neuron `VERIFY` lines are **off-chain HTTP** events
   > (`/infer`, `/open`) with no on-chain log. Either (a) render only on-chain events (simplest,
   > fully reproducible from the explorer — **recommended**), or (b) have the demo driver POST a
   > lightweight SSE/WS feed of the off-chain steps for richer narration. Pick (a) for the MVP;
   > (b) is stretch. Do **not** fabricate REQUEST rows the chain can't back.

2. **Contract reads** ← `Registry.providers(addr)` + `weightRootOf` + `Escrow` balances /
   protocol-cut accumulator, polled (or refreshed on each relevant event) to hydrate the
   **provider cards** and the **protocol stats bar**. Both providers share the **same `H_w`** —
   surface that on both cards (it's the whole point: same model advertised, one substitutes).

### 1.2 Live stream for the 3-minute demo — a continuous driver, not a one-shot

`e2e-happy`/`e2e-cheat` are single-shot. A spectator dashboard needs a *stream*. Add
`scripts/demo-driver.ts` (Phase 3): a loop that, against the Sepolia deploy, continuously has
the buyer pay → honest provider commit → challenger pass → finalize (green cadence), and on an
interval routes a request to the **cheat** provider → challenge → **slash** (the red moment).
`finalizeWindow=30s` (already deployed) makes each cycle complete on camera. The driver is the
*demo's* event source; the dashboard merely renders. Keep a **seeded backlog** too (the Phase-2
historical events) so the feed is non-empty on page load before the driver produces new ones.

### 1.3 Provider-card reputation — derive from the on-chain counters, don't invent a curve

Registry already tracks `served / challenged / slashed`. Define **reputation** as a simple,
documented function of those (e.g. `served` up, `slashed` down — a bounded score), computed
client-side. Do **not** add an on-chain reputation curve (scope creep; the spec's reputation is
the counters). The cards show stake (live), the three counters, `H_w`, and a status badge
(ACTIVE green / SLASHED red, pulsing). The narrative is the **side-by-side**: honest climbs,
cheat gets wiped (stake → 0 after full-stake slash).

### 1.4 ~~Benchmark methodology~~ — **resolved by measurement: DROPPED (the StarkVerifier 2.1× lesson, for real)**

We executed option 1 (build the real Solidity verifier) to get a true apples-to-apples table, and
the honest measurement killed the deliverable:

- **Stylus side**: measured the **deployed** verifier (`0xe19d…79ae`) via `eth_estimateGas` on
  `verifyPath` with the golden good + bad `pathProof` hex → **3,698,400 gas** (good), 30,937/hash.
- **Solidity side**: built `VerifierSol.sol` (a faithful twin — same wire format, position-bound
  Poseidon-Merkle openings, Q47.16 recompute) with Poseidon via the **assembly-optimized
  `poseidon-solidity`** (vimwitch v0.0.5, 3/3 golden vectors), `forge`-tested to good→PASS /
  bad→FAIL parity on the **same golden fixtures**, deployed to Sepolia (`0xFEa6…66FB`) →
  **3,784,097 gas** (good), 31,669/hash.

**Result: ~2.3% — parity, not 2.1×.** A single fixed Poseidon permutation is already beaten flat
into optimal EVM assembly, so Stylus's typical edge doesn't appear and per-hash cost is dead even;
multi-sample doesn't change the ratio. The StarkVerifier 2.1× does not reproduce against a
best-in-class Solidity Poseidon.

> **Decision (chosen): drop the benchmark deliverable.** No honest gas-win exists to ship, and the
> CLAUDE.md invariant forbids manufacturing one (no naive-Solidity strawman, no cited-but-not-measured
> multiplier presented as ours). The build is reverted; testnet deploys are left orphaned (harmless).
> This *is* the "ship the honest result" lesson — sometimes the honest result is "no result." See §2.5.

### 1.5 Migrate to Arbitrum One — order of operations + what x402 unlocks

The One deploy fills `ADDRESSES.arbitrumOne` and lights up the **x402 headline rail** (the
deferred Phase-2 piece). Order:

```
1. Stylus Verifier → One       (needs cargo stylus; external box or pre-built wasm — §0 constraint)
2. Deploy.s.sol stack → One    (Registry → Escrow → ChallengeManager, wire managers; same as Sepolia)
3. ADDRESSES.arbitrumOne filled + sync-abis (no ABI change; addresses only)
4. seed.ts on One              (register+stake both providers in real-but-tiny ETH/USDC)
5. x402 live-run               (buyer.ts rail=x402 → real USDC buyer→provider, CDP settles+sponsors gas)
6. one happy + one cheat E2E on One   (real mainnet tx hashes for the judge path + runlog)
```

Honesty (per CLAUDE.md): on the **x402 rail there is no fee-refund-on-slash** — x402
direct-settles USDC to the provider, so the deterrent is the **stake slash + bounty** (works on
either rail), not the fee clawback. The **escrow rail** keeps the buyer refund. State both in the
honesty table; the dashboard's network badge flips Sepolia → One.

### 1.6 `verify.ts` judge path — the 60-second no-video proof

One command (per `spec.md §10`): connect to the target chain, confirm deployed **Verifier +
Registry bytecode** (`eth_getCode` non-empty), read the **cheating provider's slashed state**
(`Registry.providers` → `slashed > 0`, stake → 0), fetch the **challenge tx receipt**, decode the
**`Slashed` event**, assert the **bounty was paid** (`BountyPaid`), and print **PASS**. Takes a
`--chain sepolia|one` flag and reads `ADDRESSES`. Built on the Phase-2 E2E plumbing; it is the
product's verifier *and* the judge's fast path.

---

## 2. Work breakdown

Ordered by dependency. The dashboard (2.1–2.3) is the long pole and can start immediately
against the **existing Sepolia deploy**. `verify.ts` (2.4) and docs (2.6) parallelize. The
migrate (2.7) is the riskier tail (cargo/mainnet). *(The benchmark (2.5) is dropped — built and
measured at ~2% parity, no honest gas-win.)*

### 2.1 `packages/dashboard` — scaffold the web3 stack (do first; everything renders through it)

1. Add deps: `wagmi` v2, `viem`, `@rainbow-me/rainbowkit`, `tailwindcss` + `postcss` +
   `autoprefixer`, `framer-motion`, `@tanstack/react-query` (wagmi peer). Wire `next/font` for
   JetBrains Mono + Space Grotesk (design.md §2).
2. Tailwind config: encode the **design tokens** (design.md §2) as CSS variables + Tailwind
   theme extensions (`bg-primary`, `green-pass`, `red-slash`, `cyan-accent`, etc.). Scanline
   overlay + glow shadow utilities. Dark-only (no light mode — invariant).
3. `app/providers.tsx`: `WagmiProvider` + `RainbowKitProvider` + `QueryClientProvider`,
   configured for **Arbitrum Sepolia now / Arbitrum One at migrate** (read chain from a single
   `NEXT_PUBLIC_CHAIN` env so the flip is one var). Public RPC from `resources.md`; **no private
   keys** (read-only).
4. A typed `lib/contracts.ts`: pull `ADDRESSES` + `abis` from `@proof/shared`, expose typed
   `getContract`-style handles for Registry/ChallengeManager/Escrow. Single source of truth — no
   hand-copied ABIs.
5. `next build` + `typecheck` green; commit the scaffold before building components.

### 2.2 Dashboard components (design.md §4 — render the narrative)

1. **Header bar** (§4.1): monospace "PROOF-OF-MODEL" + blinking underscore, network badge
   (green dot + chain name from config), RainbowKit connect (muted, non-hero).
2. **Protocol stats bar** (§4.2): Total Inferences (`Finalized` + `Slashed` count), Challenges
   Filed (`ChallengeOpened`), Slash Rate (`Slashed/ChallengeOpened`), Total Fees (sum of
   `Released.amount` − or x402 receipts on One), Active Providers (Registry). Count-up animation
   (Framer Motion). Numbers from the merged event log + reads.
3. **Live event feed** (§4.3, the hero): reverse-chron rows `[timestamp][BADGE][icon] message
   [tx →]`. Colored pills per §1.1 mapping. **SLASH = full-width red glow flash; VERIFY(pass) =
   green border pulse**; new rows fade/slide in from top. Tx hash → Arbiscan (explorer URL from
   `CHAINS[chain].explorer`). Truncate hashes/addresses. Auto-scroll (pause-on-hover is stretch).
4. **Provider cards** (§4.4): two stacked cards from `Registry.providers` reads — stake,
   reputation bar (§1.3 derived score), served/challenged/slashed counters, shared `H_w`, status
   badge (ACTIVE/SLASHED pulsing). The side-by-side *is* the story (one thrives, one wiped).
5. Single-page, three-zone layout (design.md §3), no routing. Projector-friendly: high contrast,
   large type. **No user-action controls** (invariant).

### 2.3 Dashboard wiring + deploy (design.md §5–6)

1. `watchContractEvent` per contract → a merged, de-duplicated, capped (e.g. last 100) event
   store (React context or a small zustand store). **Poll fallback** every ~5s (viem
   `getLogs` from last-seen block) if WS is flaky on testnet (design.md §6) — implement both,
   prefer WS.
2. Hydrate stats + cards from reads on mount and on each relevant event (debounced). Connection
   indicator from `useBlockNumber`.
3. **Backfill on load**: fetch historical logs from the deploy block so the feed is non-empty
   before live events arrive (uses the Phase-2 history).
4. **Deploy to Vercel**: set `NEXT_PUBLIC_CHAIN` + `NEXT_PUBLIC_RPC_URL`; get the public URL.
   Verify it renders the live Sepolia feed end-to-end (run `demo-driver.ts` and watch a SLASH
   land). Re-point env to One at migrate.
5. `scripts/demo-driver.ts` (§1.2): continuous honest cadence + interval cheat, against the
   target chain, so the dashboard has a live stream during the demo. Document how to run it.

### 2.4 `scripts/verify.ts` — one-command judge path (§1.6)

1. `--chain sepolia|one`; load `ADDRESSES` + `abis` from `@proof/shared`.
2. Assert bytecode (Verifier + Registry non-empty), read cheat provider slashed state
   (`slashed>0`, stake→0), fetch the slash challenge receipt, decode `Slashed` + assert
   `BountyPaid`, print a clean **PASS** block with every tx link. Non-zero exit on any failure.
3. Reuse `_onchain.ts`/`_env.ts` helpers; consumes the addresses + tx hashes the E2E scripts
   already produce. Add to root `package.json` as `pnpm verify`.

### 2.5 ~~`scripts/benchmark.ts` + `benchmark.md` — the gas table~~ — **DROPPED (honest result)**

**Status: descoped after measurement.** The Stylus-vs-Solidity gas comparison is **not** a
Phase-3 deliverable. We built it, measured it, and the honest result does not support a Stylus
gas-win claim — so per the CLAUDE.md honesty invariant (no manufactured wins) we pull it rather
than spin it.

What we did (all reverted; testnet deploys left orphaned, harmless):
- Built `VerifierSol.sol` — a faithful Solidity twin of the Stylus `verifyPath` (same wire
  format, position-bound Poseidon-Merkle openings, Q47.16 recompute), Poseidon via the
  best-in-class **assembly-optimized `poseidon-solidity`** (vimwitch v0.0.5, 3/3 golden vectors).
- `forge`-tested it to good→PASS / bad→FAIL parity with the Stylus verifier on the **same golden
  fixtures**; deployed both to Sepolia.
- Measured `verifyPath` via `eth_estimateGas` on identical calldata.

The numbers (Arbitrum Sepolia, golden good fixture):

| `verifyPath` | gas | per-hash (~117×) |
|---|---|---|
| Stylus (`0xe19d…79ae`)   | 3,698,400 | 30,937 |
| Solidity (`0xFEa6…66FB`) | 3,784,097 | 31,669 |

**~2.3% — parity, not 2.1×.** Reason: a single fixed Poseidon permutation is already beaten flat
into optimal EVM assembly by `poseidon-solidity`, so Stylus's usual edge (loops/memory/EVM-awkward
arithmetic) doesn't appear on this workload; per-hash cost is dead even. Multi-sample (K-path)
doesn't change it — both scale linearly in hashes, so the gap stays ~2%. The StarkVerifier 2.1×
was almost certainly vs. unoptimized Solidity or different math, and does not reproduce here.

Decision: **drop the benchmark deliverable entirely** (this is the chosen option; the alternative
was keeping it as a one-line honesty-table footnote). Time reallocates to dashboard/docs.

### 2.6 Docs — honesty-table, category-rejection, README, demo script

1. **README.md** (repo root): one-paragraph what-it-is, the architecture diagram (lift `spec.md
   §6` mermaid), quickstart (`pnpm build`/`test`, run agents, `pnpm verify`), deployed addresses
   table (Sepolia + One), the Vercel URL.
2. **Honesty table**: consolidate the scattered honesty notes — deterministic toy model (not an
   LLM), single-round multi-sample (per-path ~1/N, K samples raise it; bisection is roadmap),
   1–2 challengers, payment-rail split (escrow refunds on slash; **x402 has no fee-refund**,
   deterrent = stake slash + bounty), 30s demo window ≠ production economics. Pull from `spec.md
   §8`, CLAUDE.md, `phase2-plan.md §1.3`. *(The gas-benchmark line is dropped — we measured ~2%
   parity and ship no gas-win claim; if mentioned at all, mention only as the honesty example.)*
3. **Category-rejection paragraph** (`spec.md §11`): "not zkML, not a compute marketplace — we
   commit the trace + spot-check + slash, Arbitrum's optimistic fraud-proof paradigm for
   inference; the trust rail, not a compute provider." + ecosystem-benefit line (Arbitrum agent
   economy + x402/ERC-8004 trust layer).
4. **Demo script**: one mechanic per sentence (the recording script) — land on dashboard →
   honest cadence (green) → cheat fires (red glow, stake→0, bounty) → provider cards diverge →
   `pnpm verify` prints PASS. Map each beat to what's on screen. *(No gas-table beat — benchmark
   dropped.)*

### 2.7 Migrate / redeploy to Arbitrum One (§1.5)

1. Stylus Verifier → One via `cargo stylus deploy` (toolchain is in-env — see §0; no external
   box needed). Needs a funded mainnet deployer key. Record address.
2. `Deploy.s.sol` stack → One (Registry → Escrow → ChallengeManager, wire managers; mirror the
   Sepolia deploy, short or real `finalizeWindow` per demo need). Fund the deployer (real-but-tiny).
3. Fill `ADDRESSES.arbitrumOne`; `sync-abis` (addresses only, no ABI change). Flip dashboard
   `NEXT_PUBLIC_CHAIN`/RPC → One on Vercel.
4. `seed.ts` on One (register+stake both providers). Run **one happy + one cheat E2E on One**;
   capture real mainnet tx hashes (extend the runlog).
5. **x402 live-run** (the deferred Phase-2 piece): `buyer.ts rail=x402` → real USDC
   buyer→provider via the CDP facilitator (Proton WG tunnel + `PAY_TO != buyer` prereqs per
   memory). Capture the `x-payment-response` receipt; surface it as the PAYMENT event on the
   dashboard. `verify.ts --chain one` prints PASS against the mainnet deploy.

### 2.8 Record demo + buffer

1. Run `demo-driver.ts` against the chosen demo chain; record the 3-min arc per the §2.6 demo
   script (one mechanic per sentence). Capture the SLASH glow moment cleanly.
2. Buffer day for re-takes, Vercel/RPC flakiness, faucet/funding, and the `cargo`-box Stylus
   redeploy contingency.

---

## 3. Ordering & critical path

```
dashboard scaffold (2.1)  ◀── unblocks everything visual; build against existing Sepolia deploy
        │  wagmi/viem/RainbowKit/Tailwind/Framer + tokens + providers + lib/contracts
        ▼
dashboard components (2.2) ──┐
dashboard wiring+deploy (2.3)┤  watchContractEvent + poll + backfill + Vercel + demo-driver
        │                    │
        ▼                    │   (parallel, independent of dashboard:)
verify.ts (2.4) ─────────────┤   (2.5 benchmark DROPPED — measured ~2% parity, no honest win)
docs (2.6) ──────────────────┘   (honesty table / README / category-rejection / demo script)
        │
        ▼
migrate → Arbitrum One (2.7)   ◀── Stylus deploy in-env; needs funded mainnet wallet + x402 prereqs
        │  flip dashboard env → One; seed; happy+cheat E2E on One; x402 live-run; verify --chain one
        ▼
record demo + buffer (2.8)
```

**Critical path = the dashboard (2.1→2.3)** — it's the only large net-new build and the demo's
centerpiece; start it day 12 against the live Sepolia contracts. (The §2.5 benchmark — once the
"second risk" — is **dropped**: the Solidity verifier was built and measured, the result was ~2%
parity, and there's no honest gas-win to ship.) The **migrate (2.7)** is gated only on a funded
mainnet wallet + the x402 prereqs (the Stylus deploy runs in-env) — line those up before Week 3
ends so it isn't a day-21 surprise. `verify.ts` + docs are low-risk and fill parallel capacity.

---

## 4. Acceptance criteria (Phase 3 "done")

- [ ] **Dashboard** — Next.js 14 + wagmi/viem + RainbowKit + Tailwind + Framer Motion, design
      tokens applied; header + protocol stats bar (live aggregates) + live event feed
      (SLASH red glow, PASS green pulse, Arbiscan tx links) + two provider cards (same `H_w`;
      one thrives, one slashed) — all from real contract events/reads, **read-only** (no
      user-action controls).
- [ ] **Wiring** — `watchContractEvent` + ~5s poll fallback + historical backfill; stats/cards
      hydrate from reads; deployed to a **public Vercel URL** rendering the live feed; a
      `demo-driver.ts` produces a continuous green cadence + interval SLASH on camera.
- [ ] **`scripts/verify.ts`** — one command: bytecode ✓ + slashed state ✓ + `Slashed` event
      decoded + bounty paid ✓ → prints **PASS** (and non-zero exit on failure); `--chain
      sepolia|one`.
- [x] ~~**Benchmark** — Stylus-vs-Solidity `verifyPath` gas table.~~ **DROPPED (§2.5):** measured
      ~2.3% parity vs best-in-class `poseidon-solidity` — no honest gas-win to ship, so the
      benchmark is not a deliverable (CLAUDE.md: no manufactured wins). Raw numbers in §2.5.
- [x] **Docs** — honesty table (incl. x402 no-fee-refund + single-round multi-sample framing),
      category-rejection paragraph + ecosystem benefit, README (quickstart + addresses + URL),
      demo script (one mechanic per sentence). *(§2.6 — `README.md` + `DEMO.md`. README's Vercel
      URL + Arbitrum One addresses left as `pending`, filled at the §2.3 deploy / §2.7 migrate.)*
- [ ] **Migrate** — Stylus + stack redeployed to Arbitrum One; `ADDRESSES.arbitrumOne` filled;
      dashboard flipped to One; one happy + one cheat E2E on One with real tx hashes; **x402
      live-run** settles a real USDC buyer→provider payment (CDP facilitator); `verify --chain
      one` PASS.
- [ ] **Demo recorded** (3-min arc) + TODO.md Phase-3 boxes checked.

---

## 5. Risks & mitigations

- ~~`cargo` absent → can't rebuild/redeploy the Stylus Verifier to One.~~ **Resolved**: cargo +
  cargo-stylus are in-env and compile `packages/stylus` cleanly (§0), so the One Stylus deploy
  runs here directly. Residual risk is only a **funded mainnet deployer key** for the deploy tx —
  line that up with the rest of the migrate funding.
- ~~**Poseidon-in-Solidity (benchmark option 1) over-runs.**~~ **Closed — benchmark dropped (§2.5).**
  The Solidity verifier was built (Poseidon via assembly-optimized `poseidon-solidity`, golden-vector
  + fixture parity) and measured: ~2% gas parity with Stylus, no honest win → the benchmark is not a
  deliverable. The risk that materialised was not "over-run" but "honest result doesn't sell Stylus";
  resolved by dropping it rather than manufacturing a multiplier.
- **x402 mainnet live-run flakiness / wallet funding.** Mitigation (per CLAUDE.md): escrow on
  Sepolia is the proven spine and the dashboard's primary data source; x402 is the headline
  bundled into the migrate, with the Phase-0 prereqs (Proton WG tunnel, `PAY_TO != buyer`) already
  documented. Don't block the demo on it — the slash/bounty deterrent works on either rail.
- **Testnet event WS flakiness breaks the live feed.** Mitigation: implement the ~5s `getLogs`
  poll fallback + historical backfill so the feed is robust and non-empty on load.
- **No live stream during the demo** (E2E scripts are one-shot). Mitigation: `demo-driver.ts`
  continuous loop + seeded backlog so green/red are always flowing on camera.
- **Read-only invariant slips** (someone adds a "Submit Challenge" button to make it interactive).
  Mitigation: hard rule (CLAUDE.md + design.md §9) — the dashboard is a window, not a tool; wallet
  connect enables nothing in MVP.
- **Honesty (CLAUDE.md).** The benchmark is the live example: we measured ~2% parity, found no
  honest gas-win, and **dropped the deliverable rather than inventing a multiplier** (§2.5) — the
  StarkVerifier 2.1× lesson applied for real. Likewise state the x402 no-fee-refund nuance,
  single-round multi-sample bound, toy-model + roadmap (LLMs, bisection) plainly in the honesty
  table; don't oversell the 30s window as production economics.

---

## 6. Out of scope for Phase 3 (stretch / roadmap — state proudly)

- **Dashboard stretch** (design.md §4.5, §8, TODO stretch): event detail drawer (neuron coords,
  expected vs actual, Merkle path, gas badge), SLASH sound effect, auto-scroll pause-on-hover,
  off-chain SSE/WS narration feed for `/infer`/`/open` steps.
- **Roadmap** (unchanged, stated proudly): real/non-deterministic LLMs (tolerance-band
  commitments), interactive multi-round bisection (the paper's refereed model), a large
  challenger swarm (MVP = 1–2), challenger bonds + economic-parameter tuning, hardened x402
  facilitator, withdraw-lock against active challenges, Poseidon benchmark hardening.
