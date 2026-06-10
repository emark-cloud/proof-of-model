"use client";

/**
 * Web3 + data providers (phase3-plan §2.1.3). WagmiProvider + RainbowKit +
 * react-query, configured for the active chain from lib/chain.ts (Arbitrum
 * Sepolia now / One at migrate — one env var). Public RPC only; NO private keys
 * — the dashboard is read-only (CLAUDE.md invariant). Wallet connect is optional
 * and enables nothing in the MVP (legitimacy signaling per design.md §5).
 */
import "@rainbow-me/rainbowkit/styles.css";

import { useState, type ReactNode } from "react";
import { http } from "viem";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  RainbowKitProvider,
  getDefaultConfig,
  darkTheme,
} from "@rainbow-me/rainbowkit";

import { viemChain, rpcUrl } from "@/lib/chain";

// WalletConnect projectId — connect is optional/non-functional in MVP, so a demo
// fallback is acceptable; set NEXT_PUBLIC_WC_PROJECT_ID for a real WC session.
const projectId =
  process.env.NEXT_PUBLIC_WC_PROJECT_ID ?? "proof-of-model-spectator";

const wagmiConfig = getDefaultConfig({
  appName: "Proof-of-Model",
  projectId,
  chains: [viemChain],
  transports: { [viemChain.id]: http(rpcUrl) },
  ssr: true,
});

// Dark terminal theme tuned to the design tokens (design.md §2).
const rainbowTheme = darkTheme({
  accentColor: "#00d4ff", // --cyan-accent
  accentColorForeground: "#0a0a0f", // --bg-primary
  borderRadius: "small",
  overlayBlur: "small",
});

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider theme={rainbowTheme} modalSize="compact">
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
