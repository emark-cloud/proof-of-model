"use client";

/**
 * Header bar — design.md §4.1. Monospace wordmark (links home) + blinking underscore,
 * a link to the live dashboard, a network badge (green dot + active chain from
 * lib/chain.ts), and the RainbowKit connect button kept deliberately muted (not the
 * hero; connect enables nothing in the read-only MVP — phase3-plan §2.1.3).
 */
import Image from "next/image";
import Link from "next/link";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { chainMeta } from "@/lib/chain";

export function Header() {
  return (
    <header className="flex items-center justify-between border-b border-border-default px-6 py-4">
      <Link
        href="/"
        className="group flex items-center gap-1.5 transition hover:opacity-80"
      >
        <Image
          src="/logo.png"
          alt="Proof-of-Model"
          width={567}
          height={104}
          priority
          className="h-14 w-auto"
        />
        <span className="cursor-blink" />
      </Link>

      <div className="flex items-center gap-5">
        <Link
          href="/dashboard"
          className="font-mono text-sm text-text-secondary transition hover:text-green-pass"
        >
          live<span className="text-text-dim"> ↗</span>
        </Link>
        <span className="flex items-center gap-2 font-mono text-sm text-text-secondary">
          <span className="inline-block h-2 w-2 rounded-full bg-green-pass shadow-glow-green" />
          {chainMeta.name}
        </span>
        {/* Muted, compact — legitimacy signaling only (design.md §5). */}
        <ConnectButton
          showBalance={false}
          accountStatus="address"
          chainStatus="none"
        />
      </div>
    </header>
  );
}
