# Demo script — Proof-of-Model (3-minute recording)

This is the **talk track + screen map** for the recorded demo, structured as a hackathon pitch:
hook → gap → product → live workflow → differentiator → proof → operator value → vision → team.
One mechanic per sentence. Each beat names what to **say** and what's **on screen**.

The driver (`pnpm demo:driver`) runs an honest green cadence and fires a cheat→slash every 4th
cycle, so the SLASH moment is reproducible on camera — **wait for a fresh one** rather than scrubbing.

**Setup:** dashboard open on the live chain, feed already backfilled (non-empty on load),
connection dot reads **live**, both provider cards hydrated (PROVIDER_A ACTIVE green, PROVIDER_B
not yet slashed), `pnpm demo:driver` running in a terminal off-camera.

---

## What this is (read before the architecture section if you're new to the repo)

**Plain language:** AI agents are starting to pay each other for work. A buyer agent asks a
provider agent to run a model and pays per call. But the buyer has no way to know the provider
actually ran *the model it promised* — a cheating provider can quietly swap in a smaller, cheaper
model, pocket the difference, and return a plausible-looking answer. **Proof-of-Model** makes the
provider *commit to which model it ran* and lets anyone *spot-check* that claim and *slash* the
provider's stake if it lied. It's a trust layer for paid AI inference between agents.

**Technical framing:** a verifiable-inference marketplace on Arbitrum applying Arbitrum's own
**optimistic, sampling-based fraud-proof paradigm** to ML inference. Providers publish a
**Poseidon-Merkle root of their full activation trace** on-chain (a tamper-proof fingerprint of
every neuron value the model computed). Buyers pay per call. Challengers sample a **random path
from an output neuron back to the input layer** and recompute it in fixed-point against the
committed weights; a mismatch is a **provable cheat** and triggers an on-chain slash. No
re-running the whole model, no heavyweight zero-knowledge proof — just a cheap random spot-check
backed by stake.

---

## The arc

**1 — Hook: the problem (the frame).** *[outline §1 hook · §3 one-sentence product]*
> "The agent economy is about to pay for a *lot* of AI inference — but a buyer agent has no way to
> know the provider ran the model it charged for, instead of a cheaper knockoff. Proof-of-Model is
> the trust rail: providers commit to the model they ran, challengers spot-check it, and cheaters
> get slashed. Everything on this screen is autonomous agents — the human just watches. Green means
> honest; red means caught."
*On screen:* full dashboard — header, protocol stats bar (challenges / slash rate / active
providers), the live event feed centre, two provider cards right.

**2 — Why today's answers fall short (the gap).** *[outline §2 why existing solutions fail]*
> "Today you either *trust the provider's reputation* — no proof — or you re-run the model yourself,
> which defeats the point of outsourcing it. Zero-knowledge ML proofs are real but orders of
> magnitude too slow and expensive per call. We borrow Arbitrum's own trick instead: don't prove
> every call, make cheating *catchable* and *expensive*."
*On screen:* stay on the dashboard; let one honest cycle begin to land in the feed.

**3 — The core workflow, live (make it real).** *[outline §4 show the core workflow live]*
> "Watch one request. A buyer agent pays a provider per call — here over the on-chain escrow rail on
> Sepolia, with x402 as the production payment rail — the provider returns the output and commits
> the Merkle root of its activation trace on-chain, and a challenger samples a random path and
> verifies it."
*On screen:* a `PAYMENT → COMMIT → CHALLENGE → VERIFY → FINALIZE` run of events slides into the
feed; the VERIFY row reads `VERIFIER: neuron (L2, j3) recomputed ✓ — PASS` with a **green border
pulse**.

**4 — The differentiator: name the check (why this, not the obvious alternative).** *[outline §5 differentiator]*
> "Here's what's unique. The verifier walks a *random path from an output neuron back to the input
> layer* and recomputes each node in fixed-point against the committed weights. To pass while serving
> a cheaper model, a provider would have to fake a trace consistent with the real weights along
> *every* sampled path — which means actually running the real model. That's the soundness, and it
> costs a tiny spot-check instead of a full proof."
*On screen:* point at a PASS row / let one more honest cycle land green; stats bar ticks up.

**5 — The cheat fires (the drama).** *[outline §4 result · §6 hard-to-fake]*
> "Now the second provider serves a bad trace — and the challenger catches the mismatch on a sampled
> node."
*On screen:* the cheat cycle lands — a **SLASH** row flashes **full-width red glow**, reading
`VERIFIER: neuron (L1, j5) mismatch ✗ — SLASHED`.

**6 — The consequence (stake → 0, bounty paid).** *[outline §5 on-chain settlement]*
> "Its stake is slashed to zero on-chain, and the bounty goes to the challenger that caught it.
> Honesty pays; cheating is provably unprofitable."
*On screen:* PROVIDER_B card flips — dot to red, **Stake drops visibly**, Slashes count
increments, **Status: SLASHED** badge pulses; a `BOUNTY` row (green) shows the payout.

**7 — Divergence + proof it's not staged (trust & reliability).** *[outline §6 prove trust / audit trail]*
> "Same committed weights, two outcomes — the honest provider keeps earning, the cheat is out. And
> none of this is theatre: one command reads the chain and confirms it."
*On screen:* two provider cards side by side — PROVIDER_A ACTIVE/green, PROVIDER_B SLASHED/red,
identical `H_w`. Then cut to terminal, run `pnpm verify` — it asserts the on-chain slashed state,
decodes the `Slashed`/`BountyPaid` events, and prints a clean **PASS** block with every tx link.

**8 — Operator value + scale (who pays, and the vision).** *[outline §7 operator side · §8 scale & vision]*
> "For a model provider, this is how you *prove* you're running the expensive model and charge a
> premium for it. For a buyer agent, it's how you safely spend on inference you didn't run yourself.
> Today it's a deterministic toy net and a single-round check — the same paradigm scales to real
> models with tolerance-band commitments and multi-round bisection. We're building the verification
> layer for the entire paid-agent inference economy."
*On screen:* back to the full dashboard, stats bar showing accumulated challenges / slash rate.

**9 — Category line + team (close).** *[outline §9 team credibility]*
> "This isn't zkML and it isn't a compute marketplace — we commit the trace, spot-check it, and slash
> cheats: Arbitrum's optimistic fraud-proof paradigm, as the trust rail for paid agent inference.
> Built end-to-end — Stylus verifier, Solidity contracts, and the agent stack — and it's running live
> right now."

---

## Beat → screen map (quick reference)

| Beat | Outline § | Say | Screen |
|---|---|---|---|
| 1 | §1, §3 | Hook: agents will pay for inference they can't verify | Full dashboard |
| 2 | §2 | Reputation / re-run / zkML all fail | Dashboard, cycle begins |
| 3 | §4 | Buyer pays → commit → verify, live | `PAYMENT/COMMIT/CHALLENGE/VERIFY/FINALIZE` feed run, green pulse |
| 4 | §5 | Random output→input path recompute = the differentiator | VERIFY/PASS row / stats tick |
| 5 | §4, §6 | Cheat caught on a sampled node | **SLASH** row, full-width red glow |
| 6 | §5 | Stake→0, bounty paid | PROVIDER_B card flips red, BOUNTY row |
| 7 | §6 | Honest vs caught + judge path proof | Two cards diverge (same `H_w`) → terminal `pnpm verify` → PASS |
| 8 | §7, §8 | Operator value + scale to real models | Full dashboard, stats bar |
| 9 | §9 | Category-rejection close + team | (dashboard) |

*No gas-table beat — the benchmark was dropped (measured ~2% parity, no honest win).*

---

## Architecture — what it is and how it's used

Two registers below: **plain language** (what each piece does and why) and **technical** (the exact
mechanism). The whole system is a pnpm monorepo; each bullet maps to a `packages/*` directory.

### The actors (who does what on screen)

- **Provider agent** — *plain:* the seller. Runs the model for a buyer and posts a public,
  tamper-proof fingerprint of the computation. *technical:* `packages/agents` provider; runs the
  reference net, builds the Poseidon-Merkle trace, commits root **R** on-chain, and serves
  `openPath(ρ)` proof bundles on request. Has an honest mode and a `cheat` flag (commits a corrupt
  **R**).
- **Buyer agent** — *plain:* the customer. Pays per call and gets the output. *technical:* signs the
  payment (x402 / EIP-3009 on the production rail; on-chain **escrow** rail in the shipped MVP) and
  triggers the provider's commit.
- **Challenger agent** — *plain:* the auditor. Randomly spot-checks providers and gets a bounty for
  catching a cheat. *technical:* samples a random output→input path, pulls the provider's opened
  proof bundle, runs it through the verifier, and if it fails, calls `ChallengeManager` to slash.
- **Human** — *plain:* watches only. *technical:* the dashboard is **read-only re: the protocol** —
  no browser tx, no manual challenge. (One exception: a server-side demo launcher that starts/stops
  the off-chain agent driver; it never sends protocol transactions.)

### The pieces (the `packages/*`)

- **`packages/model` — the reference network.** *Plain:* the actual little AI model everyone agrees
  on, plus the tooling to fingerprint a run of it. *Technical:* a deterministic **3→8→4→2
  fixed-point net** (Q-format i64 — *not* a real LLM, by design, so every machine computes bit-identical
  values). Produces the activation trace, its Poseidon-Merkle root **R**, the weight root **H_w**,
  and `openPath(ρ)` — the verifier's proof bundle for one random path (each node's activation +
  weight row + bias + full parent-layer activations). Its golden known-good / known-bad fixtures are
  the contract every other package tests against.
- **`packages/stylus` — the Verifier (the deep-engineering core).** *Plain:* the on-chain referee
  that re-does the math for the sampled path and says PASS or FAIL. *Technical:* a Rust smart contract
  compiled to WASM via **Arbitrum Stylus**. It verifies the Poseidon Merkle proofs, then for each node
  on the sampled path recomputes `a_j = φ(Σ wᵢⱼ·aᵢ)` in fixed-point using the **committed weights from
  H_w** and the **opened parent activations from R**, and asserts the opened activation matches.
  Looping this per-node check along the path is the whole verification.
- **`packages/contracts` — the money + rules (Solidity, Foundry).** *Plain:* registration, staking,
  the challenge/slash logic, and the escrow that holds the buyer's payment until a call finalizes.
  *Technical:* **Registry + Staking** (ERC-8004-style identity/stake), **ChallengeManager** (calls the
  Stylus Verifier and slashes on FAIL, paying the challenger's bounty), **Escrow/Fee** (per-call
  payment, released on finalize after the challenge window).
- **`packages/agents`** — the provider / buyer / challenger implementations described above.
- **`packages/dashboard`** — the read-only Next.js spectator UI (the screen in the demo); renders
  on-chain events, the live feed, and provider cards. Deployed on Vercel.
- **`packages/shared`** — the single source of truth: generated ABIs, deployed addresses, and the
  **fixed-point + Poseidon params**. *Critical invariant:* these params MUST be byte-identical across
  TS, Rust, and Solidity — divergence silently breaks every equality check.

### How a single call flows (end to end)

1. **Pay** — buyer pays the provider per call (escrow rail in the MVP; x402 in production).
2. **Run + Commit** — provider runs the `model` net and commits Merkle root **R** of the activation
   trace on-chain. (`H_w`, the committed weight root, is fixed and public.)
3. **Sample + Open** — challenger picks a random output→input path ρ; the provider returns
   `openPath(ρ)` — the activations and weights along it.
4. **Verify** — the **Stylus Verifier** checks the Merkle proofs and recomputes every node on the
   path in fixed-point. PASS → honest. Mismatch → provable cheat.
5. **Settle** — PASS: the call **finalizes** and the fee is released (green). FAIL: `ChallengeManager`
   **slashes** the provider's stake to zero and pays the bounty to the challenger (red).

**Why it's sound (the one-line version):** a provider serving a cheaper model produces a trace that
won't match `H_w` somewhere along the path. A single path bounds detection of a one-node cheat at
~1/N (N = max layer width); **multi-sample** (several independent paths) drives that up. The only way
to pass every sampled path is to have actually run the real model.

> Scope honesty (keep saying this): the MVP is a **deterministic toy model + single-round, multi-sample
> check**. Real/non-deterministic LLMs (tolerance-band commitments) and interactive multi-round
> bisection are **roadmap** — the same paradigm, scaled up.
