# Demo script — Proof-of-Model (3-minute recording)

One mechanic per sentence. Each beat names what to say and what's on screen. The driver
(`pnpm demo:driver`) runs an honest green cadence and fires a cheat→slash every 4th cycle, so the
SLASH moment is reproducible on camera — wait for a fresh one rather than scrubbing.

**Setup:** dashboard open on the live chain, feed already backfilled (non-empty on load),
connection dot reads **live**, both provider cards hydrated (PROVIDER_A ACTIVE green,
PROVIDER_B not yet slashed), `pnpm demo:driver` running in a terminal off-camera.

---

## The arc

**1 — Land on the dashboard (the frame).**
> "Agents are transacting autonomously here — a buyer pays for inference, providers commit to the
> model they ran, challengers spot-check it, and cheaters get slashed. The human just watches.
> Green means honest; red means caught."
*On screen:* full dashboard — header, protocol stats bar (challenges / slash rate / active
providers), the live event feed centre, two provider cards right.

**2 — A request flows through (the honest cadence).**
> "A buyer agent pays a provider per call over x402, the provider returns the output and commits
> the Merkle root of its activation trace on-chain, and a challenger samples a random path and
> verifies it."
*On screen:* a `PAYMENT → COMMIT → CHALLENGE → VERIFY → FINALIZE` run of events slides into the
feed; the VERIFY row reads `VERIFIER: neuron (L2, j3) recomputed ✓ — PASS` with a **green border
pulse**.

**3 — Name the check (the core idea, fast).**
> "The verifier walks a random path from an output neuron back to the input layer and recomputes
> each node in fixed-point against the committed weights — if the provider served a cheaper model,
> the trace won't match and the path catches it."
*On screen:* point at a PASS row / let one more honest cycle land green; stats bar ticks up.

**4 — The cheat fires (the drama).**
> "Now the second provider serves a bad trace — and the challenger catches the mismatch."
*On screen:* the cheat cycle lands — a **SLASH** row flashes **full-width red glow**, reading
`VERIFIER: neuron (L1, j5) mismatch ✗ — SLASHED`.

**5 — The consequence (stake → 0, bounty paid).**
> "Its stake is slashed to zero and the bounty goes to the challenger that caught it."
*On screen:* PROVIDER_B card flips — dot to red, **Stake drops visibly**, Slashes count
increments, **Status: SLASHED** badge pulses; a `BOUNTY` row (green) shows the payout.

**6 — The divergence (honest vs caught, side by side).**
> "Same committed weights, two outcomes — the honest provider keeps earning, the cheat is out."
*On screen:* the two provider cards side by side — PROVIDER_A ACTIVE/green, PROVIDER_B
SLASHED/red, identical `H_w`.

**7 — The judge path (proof, not vibes).**
> "And none of this is staged — one command reads the chain and confirms it."
*On screen:* cut to terminal, run `pnpm verify` — it asserts the on-chain slashed state, decodes
the `Slashed`/`BountyPaid` events, and prints a clean **PASS** block with every tx link.

**8 — Land the category line (close).**
> "This isn't zkML and it isn't a compute marketplace — we commit the trace, spot-check it, and
> slash cheats: Arbitrum's optimistic fraud-proof paradigm, as the trust rail for paid agent
> inference."

---

## Beat → screen map (quick reference)

| Beat | Say | Screen |
|---|---|---|
| 1 | The frame: agents transact, human watches | Full dashboard |
| 2 | Buyer pays → commit → verify | `PAYMENT/COMMIT/CHALLENGE/VERIFY/FINALIZE` feed run, green pulse |
| 3 | Random path recompute = the check | VERIFY/PASS row / stats tick |
| 4 | Cheat caught | **SLASH** row, full-width red glow |
| 5 | Stake→0, bounty paid | PROVIDER_B card flips red, BOUNTY row |
| 6 | Honest vs caught | Two provider cards diverge, same `H_w` |
| 7 | Judge path | Terminal: `pnpm verify` → PASS |
| 8 | Category-rejection close | (dashboard) |

*No gas-table beat — the benchmark was dropped (measured ~2% parity, no honest win).*
