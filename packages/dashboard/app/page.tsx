import { LAYER_SIZES, MAX_WIDTH } from "@proof/shared";
import { chainMeta, CHAIN_KEY } from "@/lib/chain";
import { isDeployed } from "@/lib/contracts";

// Read-only spectator mode (CLAUDE.md invariant): NO user actions beyond an
// optional wallet connect. This is the Phase-3 §2.1 scaffold landing — the web3
// stack (wagmi/viem/RainbowKit/Tailwind/Framer + design tokens) is wired; the
// live event feed, provider cards, and stats bar land in §2.2/§2.3.
export default function Home() {
  return (
    <main className="mx-auto max-w-3xl px-8 py-16 font-mono">
      <h1 className="font-display text-xl font-bold tracking-tight">
        <span className="text-text-primary">PROOF-OF-MODEL</span>
        <span className="cursor-blink text-green-pass" />
      </h1>

      <p className="mt-4 text-base leading-relaxed text-text-primary">
        Verifiable-inference marketplace for the agent economy on Arbitrum.
        Providers commit to <em>which model they ran</em>; challengers spot-check a
        random output→input path and slash provable cheats.
      </p>

      <p className="mt-3 text-sm text-text-secondary">
        Spectator dashboard — Phase-3 §2.1 web3 scaffold. Live feed, provider
        cards, and stats bar arrive next (§2.2/§2.3).
      </p>

      <dl className="mt-8 grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-sm">
        <dt className="text-text-secondary">Network</dt>
        <dd className="text-text-primary">
          {LAYER_SIZES.join(" → ")} &nbsp;(max width N = {MAX_WIDTH})
        </dd>

        <dt className="text-text-secondary">Chain</dt>
        <dd className="text-text-primary">
          <span className="mr-2 inline-block h-2 w-2 rounded-full bg-green-pass align-middle shadow-glow-green" />
          {chainMeta.name}
          <span className="ml-2 text-text-dim">({CHAIN_KEY})</span>
        </dd>

        <dt className="text-text-secondary">Contracts</dt>
        <dd className={isDeployed ? "text-green-pass" : "text-amber-pending"}>
          {isDeployed ? "deployed ✓" : "not deployed on this chain yet"}
        </dd>

        <dt className="text-text-secondary">Explorer</dt>
        <dd>
          <a href={chainMeta.explorer} target="_blank" rel="noreferrer">
            {chainMeta.explorer}
          </a>
        </dd>
      </dl>
    </main>
  );
}
