# Proof-of-Model — Spectator Dashboard Design

*Frontend design spec for the hackathon demo dashboard.*

---

## 1. Audience & Demo Story

**Primary:** Hackathon judges who need to understand the system in under 3 minutes.
**Secondary:** Technical devs who want to see the protocol depth.

**The story the dashboard tells in one glance:**
Agents are transacting autonomously — a buyer pays for inference, providers commit traces, challengers spot-check, and cheaters get slashed. The human watches. Green means honest. Red means caught.

**The demo arc (what judges see in 3 min):**

1. Land on dashboard → agents are already running, events streaming in.
2. Watch a few inference requests flow through: buyer pays → provider commits → challenger verifies → **PASS** (green).
3. The cheating provider serves a bad trace → challenger catches it → **SLASHED** (red flash). Stake drops. Bounty paid.
4. Glance at provider cards: honest provider's reputation climbing, cheater's reputation destroyed.
5. Protocol stats show the economic game is self-sustaining.

**Key UX principle:** The dashboard is *read-only spectator mode*. No user actions beyond connecting a wallet (optional) and watching. Every element answers one question: "Is the verification game working?"

---

## 2. Visual Direction

**Aesthetic:** Dark terminal / hacker — a mission-control screen monitoring autonomous agents.

**Mood references:** Warp terminal, Grafana dark dashboards, Bloomberg terminal, sci-fi HUDs. Not a consumer app — a *control room*.

**Design tokens:**

```
Background:
  --bg-primary:     #0A0A0F        (near-black with slight blue)
  --bg-surface:     #12121A        (card/panel backgrounds)
  --bg-elevated:    #1A1A26        (hover states, active panels)

Borders & lines:
  --border-default: #1E1E2E        (subtle panel separators)
  --border-accent:  #2A2A3C        (emphasized borders)

Text:
  --text-primary:   #E0E0E8        (main text, high contrast)
  --text-secondary: #6B6B80        (labels, timestamps, muted)
  --text-dim:       #3A3A4E        (decorative, background text)

Semantic colors:
  --green-pass:     #00FF88        (PASS events, honest provider, success)
  --green-dim:      #00FF8820      (green glow/background tint)
  --red-slash:      #FF3366        (SLASH events, cheater, failure)
  --red-dim:        #FF336620      (red glow/background tint)
  --amber-pending:  #FFB020        (pending/in-progress states)
  --cyan-accent:    #00D4FF        (links, interactive elements, buyer)
  --purple-protocol:#8B5CF6        (protocol fees, system-level)

Typography:
  --font-mono:      'JetBrains Mono', 'Fira Code', monospace
  --font-display:   'Space Grotesk', sans-serif   (headings only)
  --font-size-xs:   11px           (timestamps, hashes)
  --font-size-sm:   13px           (labels, secondary)
  --font-size-base: 15px           (body text)
  --font-size-lg:   20px           (card titles)
  --font-size-xl:   28px           (protocol stats, hero numbers)
  --font-size-xxl:  48px           (big number callouts)

Effects:
  - Subtle scanline overlay on bg (CSS repeating-gradient, very low opacity)
  - Green/red glow on PASS/SLASH events (box-shadow with semantic colors)
  - Monospace everything except headings
  - Blinking cursor on the live feed title
  - Smooth fade-in for new events (no jarring pops)
```

---

## 3. Layout & Views

**Single-page dashboard with three zones, no routing/tabs.** Judges shouldn't need to navigate — everything is visible or one scroll away.

```
┌─────────────────────────────────────────────────────────┐
│  HEADER BAR                                             │
│  Logo + "Proof-of-Model" | Network badge | Wallet btn   │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  PROTOCOL STATS BAR  (horizontal strip of key numbers)  │
│  [Total Inferences] [Challenges] [Slash Rate] [Fees]    │
│                                                         │
├──────────────────────────────────┬──────────────────────┤
│                                  │                      │
│  LIVE EVENT FEED                 │  PROVIDER CARDS      │
│  (left, ~60% width)             │  (right, ~40% width) │
│                                  │                      │
│  Scrolling terminal-style feed   │  Card: Provider A    │
│  of verification lifecycle       │  (honest)            │
│  events                         │                      │
│                                  │  Card: Provider B    │
│                                  │  (cheater)           │
│                                  │                      │
│                                  │                      │
└──────────────────────────────────┴──────────────────────┘
```

**Responsive note:** On smaller screens, provider cards stack below the feed. Not a priority for the demo (judges use laptops/projectors).

---

## 4. Component Specs

### 4.1 Header Bar

Minimal. Left-aligned logo/name, right-aligned network + wallet.

| Element | Detail |
|---|---|
| Logo | Monospace "PROOF-OF-MODEL" with a blinking underscore cursor |
| Network badge | Green dot + "Arbitrum Sepolia" (or "Arbitrum One") |
| Wallet button | RainbowKit connect — muted style, not the hero element |

### 4.2 Protocol Stats Bar

A horizontal strip of 4–5 large numbers. The "at a glance" row judges read first.

| Stat | Source | Format |
|---|---|---|
| Total Inferences | Count of inference events | `1,247` |
| Challenges Filed | Count of challenge events | `38` |
| Slash Rate | `slashes / challenges` | `23.7%` |
| Total Fees Earned | Sum of x402 payments | `$124.70` (or ETH equivalent) |
| Active Providers | Count of registered providers | `2` |

**Style:** Each stat is a vertical block — big number (--font-size-xxl, --text-primary) over a small label (--font-size-xs, --text-secondary). Separated by thin vertical lines (--border-default). Numbers animate/count up on load.

### 4.3 Live Event Feed (the hero component)

A reverse-chronological terminal log of everything happening in the system. This is where the demo story unfolds.

**Event types and their visual treatment:**

```
REQUEST     [cyan]    Buyer → Provider   "BUYER requested inference from PROVIDER_A"
PAYMENT     [cyan]    x402 receipt        "BUYER paid 0.10 USDC to PROVIDER_A via x402"
COMMIT      [white]   Provider → chain   "PROVIDER_A committed trace root 0x3f2a...8b1c"
CHALLENGE   [amber]   Challenger starts  "CHALLENGER sampling neuron (L2, j3) from req #47"
VERIFY      [green]   Pass               "VERIFIER: neuron (L2, j3) recomputed ✓ — PASS"
SLASH       [red]     Fail + slash       "VERIFIER: neuron (L1, j5) mismatch ✗ — SLASHED"
BOUNTY      [green]   Payout             "CHALLENGER earned 0.5 ETH bounty from PROVIDER_B slash"
FINALIZE    [dim]     Window closed      "Request #42 finalized — no challenge, fee released"
```

**Each event row:**
```
[timestamp]  [EVENT_TYPE]  [icon]  message text  [tx link →]
12:04:31     SLASH         ✗       PROVIDER_B neuron (L1,j5) mismatch — SLASHED    0x8f2a...
```

- Timestamp in --text-dim, monospace
- Event type as a colored badge/pill
- Message in --text-primary
- Tx hash as a truncated link (--cyan-accent), opens Arbiscan
- **SLASH events get a full-width red glow flash** (the drama moment)
- **PASS events get a brief green border pulse**
- New events slide in from the top with a fade animation

### 4.4 Provider Cards (right panel)

Two cards, stacked vertically. The side-by-side comparison *is* the narrative: one thrives, one gets destroyed.

**Per card:**
```
┌─────────────────────────────┐
│  ● PROVIDER_A               │  ← green dot = online
│  0x7a3b...4f2e              │  ← address, truncated
│                             │
│  Stake        2.0 ETH       │
│  Reputation   ████████░░ 82 │  ← progress bar + number
│  Inferences   614           │
│  Challenges   19            │
│  Slashes      0             │  ← green "0" for honest
│                             │
│  Model: H_w 0x4e2f...       │
│  Status: ACTIVE             │  ← green badge
└─────────────────────────────┘

┌─────────────────────────────┐
│  ● PROVIDER_B               │  ← red dot after slash
│  0x9c1d...8a3b              │
│                             │
│  Stake        0.5 ETH       │  ← visibly lower (slashed)
│  Reputation   ██░░░░░░░░ 18 │  ← tanked
│  Inferences   633           │
│  Challenges   19            │
│  Slashes      9             │  ← red number
│                             │
│  Model: H_w 0x4e2f...       │
│  Status: SLASHED            │  ← red badge, pulsing
└─────────────────────────────┘
```

**Key detail:** Both providers claim the same model hash `H_w` — that's the point. Same model advertised, but Provider B is substituting cheaper computation. The dashboard makes this visible without explaining it.

### 4.5 Event Detail Drawer (stretch goal)

Click any event row → a slide-out panel showing:
- Full tx receipt
- For CHALLENGE/VERIFY events: the sampled path (neuron coordinates per layer), expected vs actual value, Merkle proof path
- Gas used (and if it was the Stylus verifier, show the gas savings badge)

**This is the "devs second" layer.** Judges don't need it; devs who click in see the protocol internals.

---

## 5. Interaction Model

| Action | Behavior |
|---|---|
| Page load | Auto-connects to Arbitrum Sepolia RPC, starts polling/subscribing to contract events. Feed populates immediately. |
| Wallet connect | Optional. Enables nothing extra in MVP (no user actions). Exists for legitimacy signaling. |
| Click event row | (Stretch) Opens detail drawer with tx receipt + verification details. |
| Click tx hash | Opens Arbiscan in new tab. |
| Click provider address | (Stretch) Opens Arbiscan. |
| Hover stat | (Stretch) Tooltip with breakdown. |

**No forms. No inputs. No toggles.** The dashboard is a window, not a tool.

---

## 6. Data Flow

```
Arbitrum Sepolia (contracts)
        │
        ├── Event logs (via viem/wagmi)
        │     ├── InferenceRequested
        │     ├── TraceCommitted
        │     ├── ChallengeSubmitted
        │     ├── VerificationResult (PASS/FAIL)
        │     ├── ProviderSlashed
        │     └── BountyPaid
        │
        ├── Contract reads (via viem)
        │     ├── provider registry (stake, reputation, model hash)
        │     ├── escrow balances
        │     └── protocol fee accumulator
        │
        └── Render in React via wagmi hooks
              ├── useContractEvent → live feed
              ├── useContractRead → provider cards + stats
              └── useBlockNumber → connection indicator
```

**Polling vs WebSocket:** Use `watchContractEvent` (viem) for real-time event streaming. Fall back to polling every ~5s if WS is flaky on testnet.

---

## 7. Stack

| Layer | Choice | Reason |
|---|---|---|
| Framework | Next.js 14 (app router) | Convention for wagmi projects, SSR not needed but the DX is good |
| Web3 | wagmi v2 + viem | Type-safe contract interaction, event watching |
| Wallet | RainbowKit | One-line wallet connect, dark theme built in |
| Styling | Tailwind CSS | Fast iteration, dark mode trivial, JIT for custom values |
| Fonts | JetBrains Mono (mono) + Space Grotesk (display) | Via Google Fonts or next/font |
| Animations | Framer Motion | Slide-in events, glow pulses, number counting |
| Deploy | Vercel | Zero-config for Next.js, judges get a live URL |

---

## 8. What "Done" Looks Like

**Minimum for demo day:**
- [ ] Live event feed populating from real Arbitrum Sepolia contract events
- [ ] Provider cards showing real stake/reputation from contract reads
- [ ] Protocol stats bar with live aggregate numbers
- [ ] SLASH events visually dramatic (red glow, unmissable)
- [ ] PASS events visually reassuring (green pulse, calm)
- [ ] Works on a projector (high contrast, large text)
- [ ] Deployed to a public Vercel URL judges can open

**Stretch (if time allows):**
- [ ] Event detail drawer with tx receipt + neuron coordinates
- [ ] Gas benchmark badge on verification events (Stylus vs Solidity savings)
- [ ] Sound effect on SLASH events (a subtle alert tone)
- [ ] Auto-scrolling feed with pause-on-hover

---

## 9. Anti-Patterns to Avoid

- **Don't build a generic blockchain explorer.** This isn't Etherscan. Every element serves the verification narrative.
- **Don't add *protocol* user actions.** The human is a spectator: no "Submit Challenge", no manual slash, no tx from the browser — that breaks the agentic story. *(One sanctioned exception, decision 2026-06-11: a **demo launcher** that starts/stops the off-chain agent driver — `DemoControl` + `/api/demo/*`. It kicks off the show and explains it; the agents still do every protocol step. It is not a protocol action.)*
- **Don't show raw JSON or unformatted data.** Terminal aesthetic ≠ lazy formatting. Every number is labeled, every hash is truncated, every event is human-readable.
- **Don't use light mode.** The dark terminal vibe is load-bearing for the aesthetic and the demo.
- **Don't over-animate.** The SLASH glow is the one dramatic moment. Everything else is smooth and calm. If everything flashes, nothing flashes.
