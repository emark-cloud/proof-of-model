# Dashboard deploy (Vercel) — phase3-plan §2.3.4

Read-only spectator UI. No private keys client-side (invariant) — it only reads a
public RPC and watches contract events.

## Vercel project settings

- **Root Directory:** `packages/dashboard` (enable "Include files outside the root
  directory" so the pnpm workspace + `@proof/shared` are available).
- **Framework preset:** Next.js (auto-detected).
- **Install / Build:** driven by `vercel.json` here —
  - install: `pnpm install --frozen-lockfile --dir ../..` (workspace root)
  - build: `pnpm --filter @proof/shared build && next build`
    (`@proof/shared/dist` is gitignored, so it's built first).

## Environment variables

| Var | Value | Notes |
|---|---|---|
| `NEXT_PUBLIC_CHAIN` | `arbitrumSepolia` | flip to `arbitrumOne` at the §2.7 migrate |
| `NEXT_PUBLIC_RPC_URL` | _(optional)_ | override the default public RPC (lib/chain.ts) |
| `NEXT_PUBLIC_WC_PROJECT_ID` | _(optional)_ | real WalletConnect id; connect is cosmetic |

The default public RPC (`https://sepolia-rollup.arbitrum.io/rpc`) works for the demo;
set a dedicated provider URL if you hit rate limits during a live driver run.

## One-time deploy (needs your Vercel auth — interactive)

```bash
# from repo root
npx vercel link            # pick/create the project, set Root Directory = packages/dashboard
npx vercel env add NEXT_PUBLIC_CHAIN     # → arbitrumSepolia
npx vercel --prod          # build + deploy → prints the public URL
```

> Tip: type `! npx vercel login` in this session to authenticate interactively.

## Verify the live feed end-to-end

1. Open the deployed URL — the feed backfills the Phase-2 history (non-empty on load),
   the connection dot reads **live**, and both provider cards hydrate (honest ACTIVE,
   cheat SLASHED, same `H_w`).
2. From repo root run the continuous driver and watch a fresh **SLASH** land on camera:
   ```bash
   pnpm demo:driver           # honest green cadence + a cheat→slash every 4th cycle
   ```
3. At the §2.7 migrate, repoint `NEXT_PUBLIC_CHAIN=arbitrumOne` and redeploy.
