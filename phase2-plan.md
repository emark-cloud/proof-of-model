# Phase 2 — Agents + money loop + challenge game (implementation plan)

Status: planning. Owner: —. Target: end of Week 2 (per `spec.md` milestones).

Phase 2 turns the Phase-1 primitives (committed trace, openings, on-chain Stylus Verifier)
into a **live economic game** played by three agents on Arbitrum Sepolia:

- a **provider** that serves inference, commits `R` + output on-chain, and serves openings
  (with a cheat flag that corrupts one neuron);
- a **buyer** that pays per inference and gets a receipt;
- a **challenger** that samples a path, demands an opening, calls the Verifier, and — on a
  proven cheat — slashes the provider's stake and collects a bounty.

The phase ends with **two reproducible end-to-end runs on Sepolia with real tx hashes**:
the honest path (PASS → fee released) and the cheat path (FAIL → slash + bounty + refund).

The load-bearing new work is the **on-chain request lifecycle** (commit → finalize-window →
challenge → resolve) that binds money to the committed trace, and the **agent runtime** that
drives it. The Stylus Verifier and the TS reference model are *finished inputs* — Phase 2 must
not change their semantics or the cross-language invariants in `packages/shared`.

---

## 0. What already exists (Phase 0/1 — do not rebuild)

- **`packages/shared`** — locked invariants: Q47.16 fixed-point, Poseidon (BN254 t=3),
  `feltFromFixed`, `merkle.ts` (`merkleRoot/merkleProof/verifyMerkleProof`, `poseidonMany`,
  `traceLeafIndex`, `weightLeafIndex`), `network.ts` (`LAYER_SIZES`, `PATH_LENGTH`), `CHAINS`,
  `ADDRESSES` (Sepolia filled), and synced `abis/` (Registry, IVerifier, ChallengeManager, Escrow).
- **`packages/model`** — the contract for everything downstream:
  `forward()`, `commit()` (trace root R), `weightRoot()` (H_w), `openPath(spec, trace, R, H_w)`
  → `PathProof`, `encodePathProof`/`decodePathProof` (the §1.4 wire format), `samplePath(seed)`,
  and golden `buildGoodFixture`/`buildBadFixture` + `fixtures.json`. `CORRUPT_NODE` is the
  single neuron the bad fixture flips.
- **`packages/stylus`** — `verifyPath(traceRoot, weightRoot, pathProof) → bool` deployed to
  Sepolia (`0xd46e05f6…a057`); `view`/pure, **no state writes** (by design — the liveness
  counter and slashing live in the contracts). Known-good→true / known-bad→false against the
  golden fixtures. **`cargo` is NOT in this env** — Verifier stays as-is in Phase 2; we only
  *call* it.
- **`packages/contracts`** — deployed skeletons on Sepolia:
  - `Registry` (`0x94B1…Ec9`) — register `H_w` + stake (`MIN_STAKE = 0.001 ether`), reputation
    counters (`served/challenged/slashed`), `weightRootOf`, manager-gated `recordServed`,
    `recordChallenged`, `slash(provider, amount)` (forwards slashed ETH to `manager`),
    `setManager` (once), `withdraw`. **Mostly Phase-2-ready** — slash/reputation already work.
  - `ChallengeManager` (`0x514C…f30`) — skeleton: `challengeId`-keyed `Challenge{challenger,
    provider, traceRoot, openedAt, status}`, `openChallenge(provider, traceRoot, pathProof)`,
    `resolveChallenge(id, pathProof)` (already calls `verifier.verifyPath` live), events
    `ChallengeOpened/Verified/Slashed/BountyPaid`, `FINALIZE_WINDOW=1d`, `BOUNTY_BPS=1000`.
    **Needs redesign** (see §1.1) — the challenger currently *supplies* `traceRoot`, which is
    unsound; it must read a provider-bound commitment.
  - `Escrow` (`0x4304…3DC`) — skeleton: `deposit` reverts, `release`/`refund` zero the slot and
    emit but move no ETH, `PROTOCOL_CUT_BPS=500`. **Needs full implementation** (§2.1).
- **`spikes/`** — proven x402 client+server (`@x402` v2, `@coinbase/x402` facilitator,
  Arbitrum One `eip155:42161`). x402 live-run is **DEFERRED** (needs a wallet funded with
  ~$1–2 native USDC); the code pattern is ready to lift into the buyer.

---

## 1. Design decisions to lock in Phase 2

These shape the contract surface and the agent protocol. Settle them before writing the agents,
because the agents code against the contract ABIs.

### 1.1 The request lifecycle — bind money + commitment to one `requestId` (key redesign)

The skeleton has a soundness gap: `openChallenge(provider, traceRoot, …)` lets the *challenger*
assert the `traceRoot`. A cheating provider's defense is then trivial — the challenger can never
prove which root the provider actually served. **Fix: the provider commits the root on-chain,
bound to a `requestId` and `msg.sender`, and every later step reads that commitment.**

Adopt a single `requestId`-keyed lifecycle spanning Escrow + ChallengeManager:

```
requestId = keccak256(buyer, provider, nonce)   // computed off-chain, agreed by all

1. PAY      buyer →  Escrow.deposit(requestId){value: fee}        // records buyer, holds fee
                     (or x402 direct-settle on One — see §1.3)
2. COMMIT   provider → ChallengeManager.commit(requestId, traceRoot, outputHash)
                     // records Commitment{provider=msg.sender, traceRoot, outputHash,
                     //   committedAt, status: Pending}; starts FINALIZE_WINDOW. emit Committed
3a. FINALIZE (happy)  anyone → ChallengeManager.finalize(requestId)   // after window, if not Slashed
                     // → Escrow.release(requestId, provider); registry.recordServed(provider)
                     //   status: Finalized. emit Finalized
3b. CHALLENGE         challenger → ChallengeManager.openChallenge(requestId)   // within window
                     // → registry.recordChallenged(provider); status: Challenged. emit ChallengeOpened
    RESOLVE           challenger → ChallengeManager.resolveChallenge(requestId, pathProof)
                     // reads commitment.traceRoot + registry.weightRootOf(provider)
                     // ok = verifier.verifyPath(traceRoot, weightRoot, pathProof)
                     // if !ok: slashed = registry.slash(provider, SLASH_AMOUNT);
                     //         bounty = slashed*BOUNTY_BPS/1e4 → challenger;
                     //         Escrow.refund(requestId, buyer);   status: Slashed.
                     //         emit Verified(false); Slashed; BountyPaid
                     // if  ok: status: ChallengeFailed (provider honest on this path; finalize
                     //         can proceed); emit Verified(true)
```

Decisions baked in:
- **Commitment is the source of truth.** `traceRoot` is read from `commitments[requestId]`, never
  taken from the challenger. `outputHash` (keccak or poseidon of the output vector) binds the
  served output so it's non-repudiable.
- **Key everything by `requestId`** (not the skeleton's auto-increment `challengeId`). One request
  ↔ one commitment ↔ at most one open challenge. Simpler invariants, and Escrow already keys by
  `bytes32 requestId`.
- **`SLASH_AMOUNT`**: slash the provider's *full stake* (`registry.slash(provider, type(uint256).max)`
  caps at available) for the demo — a clean, visible "provider wiped out" outcome. Bounty =
  `BOUNTY_BPS` (10%) of the slashed amount to the challenger; remainder stays in the manager
  (protocol-retained, or burned — pick one, document it).
- **Refund on slash**: a proven cheat refunds the buyer's escrowed fee. (Only the Escrow rail
  supports this; the x402 rail does not — see §1.3.)
- **`FINALIZE_WINDOW`** stays `1 days` in the contract constant but the **agents/demo use a short
  override** so the E2E run completes in seconds — make the window a constructor arg or a
  testnet-configurable value (e.g. deploy a demo instance with `FINALIZE_WINDOW = 30s`), rather
  than hard-coding `1 days`. (Document that mainnet would use a real window.)

### 1.2 Off-chain provider↔challenger protocol (HTTP)

The provider runs an HTTP service; the openings are served off-chain (only roots + proofs touch
the chain). Endpoints:

- `POST /infer` `{ input: number[3] }` → `{ requestId, output: number[2], traceRoot, outputHash }`.
  Provider runs `forward(input)`, `commit(trace)`, computes `outputHash`, **commits on-chain**
  (`ChallengeManager.commit`), returns the result. (The provider holds the full `trace` keyed by
  `requestId` in memory to serve openings.)
- `POST /open` `{ requestId, spec: PathSpec }` → the **encoded `pathProof` hex** (`encodePathProof`).
  The provider runs `openPath(spec, trace, R, H_w)` over the trace it actually served — honest or
  corrupt. A cheating provider *cannot* open a consistent path through the corrupt node (the
  recompute won't match), which is exactly what the verifier catches.

The challenger never trusts the provider's `output`/`traceRoot` claim — it re-derives the path
check on-chain against the committed root.

### 1.3 Payment rail — Escrow spine (Sepolia) + x402 headline (deferred to live-run on One)

Per CLAUDE.md the **x402 rail is Arbitrum One** (CDP has no Sepolia support) and the x402 live-run
is **deferred** (needs a funded wallet). The challenge game is on **Sepolia**. Resolution:

- **The on-chain money spine for the Phase-2 E2E is the Escrow contract on Sepolia** (the
  documented fallback). It holds the fee, releases to the provider on finalize (minus the 5%
  protocol cut), and **refunds the buyer on a proven slash** — giving a clean, one-chain,
  reproducible loop for the judge path.
- **x402 is the headline buyer→provider payment**, demonstrated by lifting the proven spike into
  `buyer.ts` behind a `PAYMENT_RAIL=x402|escrow` flag, runnable on Arbitrum One when the wallet is
  funded. **Honesty note (per CLAUDE.md):** x402 direct-settles USDC to the provider, so it has
  **no fee-refund-on-slash** — under x402 the deterrent is the **stake slash + bounty** (which works
  on either rail), not the fee clawback. State this in the honesty table.

> Recommendation: **build and demo the Escrow rail end-to-end now**; keep x402 wired-but-flagged and
> run it live during the Phase-3 Arbitrum One migrate. Do **not** block the Phase-2 E2E on funding a
> mainnet USDC wallet. (This is the one scoping choice worth confirming if priorities differ.)

### 1.4 Challenger sampling & the "multi-sample" mechanic (keep the Verifier single-path)

The on-chain `verifyPath` checks **one** path. "Multi-sample" lives in the **challenger's local
search**, not in the contract:

1. Derive a path seed from on-chain data (`keccak(requestId, traceRoot, challenger, blockhash)`),
   `samplePath(seed)` → a `PathSpec`; iterate seeds for up to `K` independent paths.
2. For each sampled path: `POST /open` → get `pathProof` → **`eth_call verifyPath`** against the
   deployed Verifier (free, no gas) to learn PASS/FAIL locally.
3. If a path returns **false**, submit *that* path via `openChallenge` + `resolveChallenge`
   (a state-changing tx that slashes). If all `K` paths pass, the challenger does **not**
   challenge (honest provider) — the request finalizes normally.

This matches the spec's single-round, multi-sample model: per-path detection is bounded ~`1/N`,
and sampling `K` paths raises it. For the demo, set `K` large enough that the cheat (one corrupt
node) is reliably caught (the bad fixture's `BAD_FIXTURE_PATH_SPEC` already routes through
`CORRUPT_NODE`, so a single targeted sample suffices for the scripted demo; keep the random
multi-sample loop for the honest realism). **Using `eth_call` as the local oracle avoids a 4th
reimplementation of verify logic** — no new cross-language drift surface. (An optional TS mirror
`verifyPathLocal` may be added in `packages/model` purely for fast unit tests; not required.)

### 1.5 Agent runtime, keys, and chain access

- **Library**: `viem` for all chain interaction (wallet clients, contract reads/writes,
  `watchContractEvent`, `eth_call`). ABIs come from `packages/shared/src/abis`.
- **Accounts**: distinct funded Sepolia keys for `PROVIDER_HONEST`, `PROVIDER_CHEAT`, `BUYER`,
  `CHALLENGER` (env-injected, never committed). Provider keys also need stake (≥`MIN_STAKE`).
  Add a `.env.example` and a one-shot `scripts/fund-check.ts` that asserts balances before a run.
- **Provider service**: `express` (mirror the spike), one process per provider identity (honest /
  cheat) on different ports; `cheat: boolean` from config corrupts `trace[CORRUPT_NODE.layer]
  [CORRUPT_NODE.index]` after `forward()` and recommits R over the corrupted trace (reusing the
  bad-fixture logic so on-chain behavior == golden known-bad).
- **Determinism**: agents import `@proof/model` directly for `forward/commit/openPath` — the same
  code the fixtures pin, so off-chain == golden.

---

## 2. Work breakdown

Ordered by dependency. TS + Solidity are fully doable in this env. **Re-deploying contracts to
Sepolia requires a funded deployer key** (already used in Phase 1); the Stylus Verifier is
**not** rebuilt (no cargo) — we reuse the deployed address.

### 2.1 `packages/contracts` — finish the game (do first; agents code against these ABIs)

1. **`ChallengeManager.sol` redesign** (§1.1):
   - Add `Escrow public immutable escrow` to the constructor (`verifier`, `registry`, `escrow`,
     plus a `finalizeWindow` arg per §1.1).
   - `struct Commitment { address provider; bytes32 traceRoot; bytes32 outputHash; uint64
     committedAt; Status status; }`; `mapping(bytes32 requestId => Commitment)`.
   - `enum Status { None, Pending, Challenged, Finalized, Slashed, ChallengeFailed }`.
   - `commit(bytes32 requestId, bytes32 traceRoot, bytes32 outputHash)` — `msg.sender` is the
     provider; require provider `active` in registry, require `status==None`; store; `emit Committed`.
   - `finalize(bytes32 requestId)` — require `Pending` & `block.timestamp >= committedAt +
     finalizeWindow`; `escrow.release(requestId, provider)`; `registry.recordServed(provider)`;
     `status=Finalized`; `emit Finalized`.
   - `openChallenge(bytes32 requestId)` — require `Pending` & within window; `registry.recordChallenged`;
     `status=Challenged`; record challenger; `emit ChallengeOpened`. (Optional challenger bond —
     skip for MVP, note it.)
   - `resolveChallenge(bytes32 requestId, bytes calldata pathProof)` — require `Challenged`;
     read `c.traceRoot` + `registry.weightRootOf(c.provider)`; `ok = verifier.verifyPath(...)`;
     branch per §1.1 (slash full stake, pay 10% bounty to challenger, `escrow.refund`, emit
     `Slashed`+`BountyPaid` on fail; `ChallengeFailed`+`Verified(true)` on pass). The manager
     receives slashed ETH via `Registry.slash` (already forwards to `manager`) and pays the bounty
     out of that balance (it already has a `receive()`).
   - Keep `Verified/Slashed/BountyPaid`; add `Committed/Finalized` events for the dashboard.
2. **`Escrow.sol` implementation** (§1.3):
   - Add `address public manager; setManager(once, onlyOwner)` (mirror Registry) — gate
     `release`/`refund` to `onlyManager`.
   - `struct Dep { address buyer; uint256 amount; }`; `mapping(bytes32 => Dep)`. `deposit(requestId)`
     payable: require unique, `amount>0`, record buyer; `emit Deposited`.
   - `release(requestId, provider) onlyManager`: `cut = amount*PROTOCOL_CUT_BPS/1e4`; send `cut`
     to `owner`, `amount-cut` to `provider`; zero slot; `emit Released`.
   - `refund(requestId, buyer) onlyManager`: send `amount` to recorded buyer; zero slot; `emit Refunded`.
   - Use checks-effects-interactions + a reentrancy guard (or pull-payment) — these now move real ETH.
3. **`Registry.sol`** — small additions:
   - Optional: `withdraw()` guard against active commitments is hard to track per-request; for MVP
     keep the simple `withdraw` but **document** that the demo never withdraws mid-challenge. (Or
     add an `activeChallenges` counter bumped/cleared by the manager if time permits — stretch.)
   - Add view getters the manager/dashboard need: `stakeOf(address)`, `isActive(address)` (or rely
     on the public `providers` mapping getter — confirm tuple decoding works from viem).
4. **`script/Deploy.s.sol`** — extend to deploy in dependency order and wire everything:
   Verifier address (existing, from env) → `Registry(verifier)` → `Escrow()` →
   `ChallengeManager(verifier, registry, escrow, finalizeWindow)` →
   `registry.setManager(challengeManager)` → `escrow.setManager(challengeManager)`. Emit/print all
   addresses. Add a **short-window demo deploy** profile (`finalizeWindow=30`).
5. **Tests** (`forge test`): extend the existing 17 to cover the full lifecycle —
   `commit→finalize` releases fee minus cut & bumps `served`; `commit→openChallenge→resolve(bad
   proof)` slashes full stake, pays 10% bounty, refunds buyer, bumps `slashed`;
   `resolve(good proof)` → `ChallengeFailed`, no slash; window enforcement (`finalize` reverts
   early, `openChallenge` reverts late); access control (`onlyManager` on Escrow/Registry). **Use
   the golden `pathProof` hex from `fixtures.json`** as the verifier input so contract tests assert
   the same PASS/FAIL contract as the Verifier (mock the Verifier in-Solidity to return
   true/false, *and* keep one integration test that calls the real deployed Verifier via fork if
   feasible — otherwise rely on the agent E2E for the live verifier call).
6. `forge build && forge test`; run `scripts/sync-abis.ts` → updated ABIs land in
   `packages/shared/src/abis` (CI checks staleness). **Re-deploy to Sepolia**; update
   `ADDRESSES.arbitrumSepolia` (`Registry`, `ChallengeManager`, `Escrow` — Verifier unchanged).

### 2.2 `packages/agents` — the three actors

Add deps: `viem`, `express`, `dotenv`, and (for x402) `@x402/fetch @x402/core @x402/evm
@coinbase/x402` (lift from `spikes`). Add a small shared `chain.ts` (viem clients, contract
instances from `ADDRESSES` + `abis`, env key loading) used by all three.

1. **`provider.ts`** (replace scaffold):
   - `createProvider({ cheat, port, privateKey })` → starts the HTTP service (§1.2) and ensures the
     identity is registered+staked (`Registry.register(weightRoot){value: MIN_STAKE}` if not active;
     `weightRoot = model.weightRoot()` — both providers commit the **same** H_w per the demo).
   - `/infer`: `forward(input)` → if `cheat`, corrupt `trace[CORRUPT_NODE…]` (reuse bad-fixture
     corruption) → `commit(trace)` → `outputHash` → `ChallengeManager.commit(requestId, R,
     outputHash)` tx → return result. Keep `trace` per `requestId` in memory.
   - `/open`: `openPath(spec, trace, R, H_w)` → `encodePathProof` → hex.
   - Honest and cheat are the **same code path** modulo the `cheat` flag — the cheat is not a
     special opening, it's a corrupted trace that fails honest opening (matches the model's
     known-bad fixture). 
2. **`buyer.ts`** (replace scaffold):
   - `createBuyer({ privateKey, rail })`: builds a `requestId`, **pays** (escrow:
     `Escrow.deposit(requestId){value: fee}`; x402: wrap fetch per the spike and pay the
     provider's priced endpoint on One), then `POST /infer`. Returns `{ requestId, output,
     traceRoot, receipt }` where receipt is the escrow tx hash or the x402 `x-payment-response`.
   - Default `rail=escrow` (Sepolia); `rail=x402` runs the deferred mainnet path.
3. **`challenger.ts`** (replace scaffold):
   - `createChallenger({ privateKey, samples: K })`: `watchContractEvent(Committed)` →
     for each commitment, run the §1.4 multi-sample loop (`samplePath` → `/open` → `eth_call
     verifyPath`); on a failing path, `openChallenge(requestId)` then `resolveChallenge(requestId,
     pathProof)`; log the slash + bounty. On all-pass, do nothing (provider finalizes).
   - Honest provider ⇒ every path passes ⇒ no challenge. Cheat ⇒ a sampled path through the corrupt
     node fails ⇒ slash. This is the visible green/red the dashboard renders in Phase 3.
4. **Unit tests** (`node --test`): provider corruption matches `buildBadFixture`; `requestId`
   derivation is stable; challenger's `samplePath` loop finds the failing path on the bad fixture
   and finds none on the good fixture (using `decodePathProof` + an `eth_call` mock or the optional
   `verifyPathLocal`). Keep `agents` build green.

### 2.3 `scripts/` — orchestration + the E2E demo driver

1. `scripts/seed.ts` — register+stake both providers (honest, cheat), assert balances.
2. `scripts/e2e-happy.ts` — buyer pays honest provider → provider commits → challenger samples,
   all pass → `finalize` releases fee. **Prints every tx hash + Arbiscan link**; asserts
   `served++`, fee released minus cut.
3. `scripts/e2e-cheat.ts` — buyer pays cheat provider → commits corrupt R → challenger samples,
   one path fails → `openChallenge`+`resolveChallenge` → **slash + bounty + refund**. Prints tx
   hashes; asserts `slashed++`, provider stake → 0, bounty paid, buyer refunded, `Slashed` event.
4. These two scripts are the Phase-2 acceptance artifact and the seed of the Phase-3 `verify.ts`
   judge path. Run both against Sepolia; capture the tx hashes into the PR / a `phase2-runlog.md`.

### 2.4 `packages/shared` — record any new deploys + ABIs

- After §2.1 re-deploy, update `ADDRESSES.arbitrumSepolia`; re-run `sync-abis.ts`. (arbitrumOne
  stays null until Phase 3.) Add a `FEE` / `finalizeWindow` demo constant if agents/scripts share it.

---

## 3. Ordering & critical path

```
contracts: ChallengeManager redesign + Escrow impl + tests (2.1)   ◀── ABIs are the agent contract
        │  forge test (golden pathProof) → sync-abis → deploy Sepolia
        ▼
shared: addresses + ABIs updated (2.4)
        │
        ▼
agents: chain.ts → provider (infer/open/commit) ──┐
                 → buyer (escrow pay) ────────────┤  (provider before buyer/challenger;
                 → challenger (sample/open/verify)┘   buyer & challenger parallel)
        │  unit tests (corruption == bad fixture; sample loop)
        ▼
scripts: seed → e2e-happy → e2e-cheat on Sepolia (2.3)   ◀── real tx hashes = acceptance
```

`2.1 contracts` is the critical path — the agents can't be wired until the ABIs are final and
deployed. The TS reference model and the Stylus Verifier are **frozen inputs**; if a contract test
needs a verify result, it consumes the golden `pathProof` hex (mocked Verifier) and the *live*
verify is exercised by the agent E2E against the deployed Stylus address. x402 live-run is **off
the critical path** (deferred to Phase-3 migrate).

---

## 4. Acceptance criteria (Phase 2 "done")

- [x] `ChallengeManager` (commit/finalize/openChallenge/resolveChallenge, requestId-keyed,
      reads committed root) + `Escrow` (deposit/release/refund, protocol cut, manager-gated)
      fully implemented; `forge test` green incl. lifecycle, window, slash/bounty/refund, and
      access-control cases using the golden `pathProof`.
- [x] ABIs synced; contracts re-deployed to Sepolia; `ADDRESSES.arbitrumSepolia` updated.
      (Verifier + Registry/Escrow/ChallengeManager redeployed — see `phase2-runlog.md` for
      the ABI-selector fix that forced the verifier + stack redeploy.)
- [x] `provider` (honest + cheat), `buyer` (escrow rail), `challenger` (multi-sample) implemented;
      `@proof/agents` builds; unit tests green (cheat corruption == `buildBadFixture`; sample loop
      catches the cheat, passes the honest case).
- [x] **E2E happy path on Sepolia** — honest provider PASS, fee released (minus 5% cut), `served++`
      — with real tx hashes recorded (`phase2-runlog.md`).
- [x] **E2E cheat path on Sepolia** — cheater FAIL → full stake slashed, 10% bounty to challenger,
      buyer refunded, `Slashed` event — with real tx hashes recorded (`phase2-runlog.md`).
- [x] x402 buyer rail implemented behind `PAYMENT_RAIL`/`rail` flag (live-run deferred; documented).
- [x] TODO.md Phase-2 boxes checked; payment-rail split + the x402-no-refund nuance noted in the
      honesty table (per CLAUDE.md).

---

## 5. Risks & mitigations

- **Soundness of the commitment binding** (the skeleton's challenger-supplied root). Mitigation:
  §1.1 — provider commits the root bound to `msg.sender`+`requestId`; every later step reads it;
  the challenger never asserts a root. Covered by a contract test (challenger cannot resolve
  against a root the provider didn't commit).
- **Cross-language drift (project #1 risk).** Mitigation: agents import `@proof/model` directly
  (same code the fixtures pin); the challenger uses **`eth_call verifyPath`** as its local oracle
  rather than reimplementing verify — no 4th implementation. Contract tests consume the golden
  `pathProof` hex.
- **Real ETH movement in Escrow** (reentrancy, locked funds). Mitigation: checks-effects-interactions
  + reentrancy guard or pull-payments; `deposit` reverts on duplicate `requestId`; release/refund
  zero the slot before transfer; thorough `forge` tests for double-release/double-refund.
- **`FINALIZE_WINDOW = 1 day` makes the demo un-runnable.** Mitigation: make the window a
  constructor arg; deploy a short-window (`30s`) demo instance; document mainnet uses a real window.
- **Funded testnet keys / gas.** Mitigation: `.env.example` + `scripts/fund-check.ts` assert
  balances (4 accounts + 2 provider stakes) before a run; faucet links in `resources.md`.
- **x402 maturity / wallet funding blocks the demo.** Mitigation (per CLAUDE.md): Escrow is the
  E2E spine on Sepolia; x402 stays wired-but-flagged and runs at the Phase-3 One migrate. Do not
  block Phase-2 acceptance on mainnet USDC.
- **Honesty (per CLAUDE.md).** State the x402-no-fee-refund nuance (deterrent is the stake slash),
  keep "single-round, multi-sample" framing (per-path ~1/N, K samples raise detection), and don't
  oversell the short demo window as production economics.

---

## 6. Out of scope for Phase 2 (deferred)

The dashboard (Phase 3), `scripts/verify.ts` one-command judge path (Phase 3; the E2E scripts seed
it), the Stylus-vs-Solidity gas benchmark (Phase 3), the Arbitrum One migrate + x402 live-run
(Phase 3). Roadmap (stated proudly): real/non-deterministic LLMs + tolerance-band commitments,
interactive multi-round bisection, a large challenger swarm (MVP = 1 challenger), challenger bonds
+ economic-parameter tuning, and a withdraw-lock against active challenges.
