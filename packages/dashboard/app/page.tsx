import Link from "next/link";
import { Header } from "@/components/Header";
import { addresses, chainMeta, explorerAddress } from "@/lib/chain";

/**
 * Landing page (/) — the explainer front door: what Proof-of-Model is, how the
 * verification game works, and how an agent uses it. The live spectator dashboard
 * lives at /dashboard; this page's CTAs point there.
 *
 * Static server component — no protocol interaction, no wallet, no tx (read-only
 * invariant, CLAUDE.md / design.md §9). Copy is kept honest with the README honesty
 * table: deterministic toy model + single-round multi-sample check shipped on
 * Arbitrum Sepolia; real LLMs, bisection, and the x402-on-One rail are roadmap.
 */

export const metadata = {
  title: "Proof-of-Model — verifiable inference for the agent economy",
  description:
    "Providers commit to which model they ran, buyers pay per call, challengers spot-check a random output→input path and slash provable cheats. Arbitrum's optimistic fraud-proof paradigm, applied to ML inference.",
};

/** The five-step protocol loop — same story the demo bar narrates, landing-sized. */
const FLOW = [
  {
    n: 1,
    label: "PAY",
    tone: "text-cyan-accent",
    border: "border-cyan-accent/30",
    text: "A buyer agent pays a provider per call. The fee sits in escrow on-chain (the x402 USDC rail settles on Arbitrum One — roadmap).",
  },
  {
    n: 2,
    label: "COMMIT",
    tone: "text-text-primary",
    border: "border-border-accent",
    text: "The provider returns the output and commits a Poseidon-Merkle root R of its full activation trace, plus a weight root H_w pinning which model it ran.",
  },
  {
    n: 3,
    label: "SAMPLE",
    tone: "text-amber-pending",
    border: "border-amber-pending/30",
    text: "A challenger picks a random path from a random output neuron back to the input layer and demands the provider open it.",
  },
  {
    n: 4,
    label: "VERIFY",
    tone: "text-green-pass",
    border: "border-green-pass/30",
    text: "The Stylus verifier checks the Merkle proofs and recomputes aⱼ = φ(Σ wᵢⱼ·aᵢ + bⱼ) in fixed-point at every node on the path.",
  },
  {
    n: 5,
    label: "SETTLE",
    tone: "text-red-slash",
    border: "border-red-slash/30",
    text: "Match → PASS, fee released. Mismatch → SLASH: the provider's stake is wiped and a bounty is paid to the challenger.",
  },
];

/** The three autonomous roles — "how it's used" is: you run one of these agents. */
const ROLES = [
  {
    role: "PROVIDER",
    tone: "text-green-pass",
    text: "Serves inference for pay. Stakes collateral, commits R + H_w per call. Run honest and earn fees — or serve a cheaper model and risk the slash.",
  },
  {
    role: "BUYER",
    tone: "text-cyan-accent",
    text: "Pays per call and gets a verifiable receipt. It never has to trust the provider — the protocol, not the buyer, polices the result.",
  },
  {
    role: "CHALLENGER",
    tone: "text-amber-pending",
    text: "Watches commitments, samples random paths, demands openings, and submits provable cheats for slashing — earning the bounty.",
  },
];

const ADDRESS_ROWS: { label: string; addr: `0x${string}` | null }[] = [
  { label: "Verifier (Stylus)", addr: addresses.Verifier },
  { label: "Registry + Staking", addr: addresses.Registry },
  { label: "ChallengeManager", addr: addresses.ChallengeManager },
  { label: "Escrow / Fee", addr: addresses.Escrow },
];

export default function Landing() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />

      <main className="mx-auto w-full max-w-5xl flex-1 px-6 pb-24">
        {/* ── Hero ─────────────────────────────────────────────────────── */}
        <section className="border-b border-border-default py-20">
          <div className="mb-4 flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-text-secondary">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-pass shadow-glow-green" />
            Live on {chainMeta.name}
          </div>
          <h1 className="font-display text-xl font-bold leading-tight text-text-primary md:text-xxl">
            Verifiable inference for the{" "}
            <span className="text-green-pass">agent economy</span>.
          </h1>
          <p className="mt-6 max-w-2xl font-mono text-base leading-relaxed text-text-secondary">
            When an agent pays for model inference, it can&apos;t tell whether it got
            the model it paid for. A provider can bill for a frontier model and serve
            a cheap one. Proof-of-Model is the missing trust rail: providers{" "}
            <span className="text-text-primary">commit to which model they ran</span>,
            buyers <span className="text-text-primary">pay per call</span>, and
            challengers{" "}
            <span className="text-text-primary">
              spot-check a random output→input path and slash provable cheats
            </span>{" "}
            — Arbitrum&apos;s optimistic, sampling-based fraud-proof paradigm, applied
            to ML inference.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Link
              href="/dashboard"
              className="rounded border border-green-pass/50 bg-green-dim px-5 py-2.5 font-mono text-sm font-bold text-green-pass shadow-glow-green transition hover:bg-green-pass/20"
            >
              ▶ WATCH IT LIVE
            </Link>
            <a
              href="https://sepolia.arbiscan.io"
              target="_blank"
              rel="noreferrer"
              className="rounded border border-border-accent px-5 py-2.5 font-mono text-sm text-text-primary transition hover:border-cyan-accent hover:text-cyan-accent"
            >
              View on explorer ↗
            </a>
          </div>
        </section>

        {/* ── The problem ──────────────────────────────────────────────── */}
        <Section
          kicker="The problem"
          title="Paid inference has no receipt"
        >
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHead tone="text-red-slash">Model substitution</CardHead>
              <p className="font-mono text-sm leading-relaxed text-text-secondary">
                A provider bills for an expensive model and quietly serves a cheaper
                one. The buyer pays frontier prices for budget output and has no way
                to prove the swap.
              </p>
            </Card>
            <Card>
              <CardHead tone="text-red-slash">Output integrity</CardHead>
              <p className="font-mono text-sm leading-relaxed text-text-secondary">
                Even with the right model, the returned output may not actually match
                the claimed model+input. Nothing ties the answer to a real computation.
              </p>
            </Card>
          </div>
          <p className="mt-5 font-mono text-sm leading-relaxed text-text-secondary">
            We don&apos;t re-execute or zk-prove the whole model, and we don&apos;t
            sell compute. We{" "}
            <span className="text-text-primary">
              commit the trace, spot-check random openings, and slash provable cheats
            </span>{" "}
            — the trust rail for paid agent inference, not a compute provider.
          </p>
        </Section>

        {/* ── How it works ─────────────────────────────────────────────── */}
        <Section kicker="How it works" title="One paid call, end to end">
          <div className="flex flex-col gap-3">
            {FLOW.map((s) => (
              <div
                key={s.n}
                className={`flex gap-4 rounded border ${s.border} bg-bg-surface/40 px-5 py-4`}
              >
                <div
                  className={`shrink-0 font-mono text-lg font-bold tabular-nums ${s.tone}`}
                >
                  {String(s.n).padStart(2, "0")}
                </div>
                <div>
                  <div className={`font-mono text-sm font-bold ${s.tone}`}>
                    {s.label}
                  </div>
                  <p className="mt-1 font-mono text-sm leading-relaxed text-text-secondary">
                    {s.text}
                  </p>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-5 font-mono text-sm leading-relaxed text-text-secondary">
            No human approves any step — the agents police each other, and the heavy
            verification math runs on-chain in a Stylus (Rust) contract.
          </p>
        </Section>

        {/* ── How it's used ────────────────────────────────────────────── */}
        <Section
          kicker="How it's used"
          title="Three agents, no humans in the loop"
        >
          <div className="grid gap-4 md:grid-cols-3">
            {ROLES.map((r) => (
              <Card key={r.role}>
                <CardHead tone={r.tone}>{r.role}</CardHead>
                <p className="font-mono text-sm leading-relaxed text-text-secondary">
                  {r.text}
                </p>
              </Card>
            ))}
          </div>
        </Section>

        {/* ── Addresses ────────────────────────────────────────────────── */}
        <Section kicker="Deployed" title={`Live on ${chainMeta.name}`}>
          <div className="overflow-hidden rounded border border-border-default font-mono text-sm">
            {ADDRESS_ROWS.map((row, i) => (
              <div
                key={row.label}
                className={`flex flex-wrap items-center justify-between gap-2 bg-bg-surface px-4 py-3 ${
                  i > 0 ? "border-t border-border-default" : ""
                }`}
              >
                <span className="text-text-secondary">{row.label}</span>
                {row.addr ? (
                  <a
                    href={explorerAddress(row.addr)}
                    target="_blank"
                    rel="noreferrer"
                    className="text-cyan-accent hover:underline"
                  >
                    {row.addr}
                  </a>
                ) : (
                  <span className="text-text-dim">not deployed</span>
                )}
              </div>
            ))}
          </div>
        </Section>

        {/* ── Closing CTA ──────────────────────────────────────────────── */}
        <section className="mt-16 flex flex-col items-center gap-5 rounded border border-border-accent bg-bg-surface/40 px-6 py-12 text-center">
          <h2 className="font-display text-lg font-bold text-text-primary">
            Watch agents police each other, live.
          </h2>
          <p className="max-w-xl font-mono text-sm leading-relaxed text-text-secondary">
            Kick off the demo driver and watch honest calls pay out green and a cheat
            get caught and slashed red — every step settled on-chain.
          </p>
          <Link
            href="/dashboard"
            className="rounded border border-green-pass/50 bg-green-dim px-6 py-2.5 font-mono text-sm font-bold text-green-pass shadow-glow-green transition hover:bg-green-pass/20"
          >
            ▶ OPEN THE DASHBOARD
          </Link>
        </section>
      </main>
    </div>
  );
}

/* ── Local presentational primitives (match design.md tokens) ──────────── */

function Section({
  kicker,
  title,
  children,
}: {
  kicker: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-b border-border-default py-14">
      <div className="mb-1 font-mono text-xs uppercase tracking-widest text-green-pass">
        {kicker}
      </div>
      <h2 className="mb-6 font-display text-lg font-bold text-text-primary">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded border border-border-default bg-bg-surface/40 px-5 py-4">
      {children}
    </div>
  );
}

function CardHead({
  tone,
  children,
}: {
  tone: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`mb-2 font-mono text-sm font-bold ${tone}`}>{children}</div>
  );
}

function Mono({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded bg-bg-elevated px-1 py-0.5 text-text-primary">
      {children}
    </code>
  );
}

