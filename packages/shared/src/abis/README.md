# Generated ABIs

This directory is the single home for contract ABIs consumed by the agents and
dashboard. They are **generated**, not hand-edited: `pnpm abis:sync` (root) runs
`scripts/sync-abis.ts`, which reads Foundry's `packages/contracts/out/**` build
artifacts and writes `<Contract>.json` here. Run it after `forge build`.
