/**
 * Provider agent (§2.2.1). Serves inference over HTTP, commits the trace root +
 * output hash on-chain (bound to `msg.sender` + `requestId`), and serves path
 * openings on demand. Honest by default; `cheat` corrupts a single neuron so the
 * served trace is inconsistent with the committed weights along any path through
 * it — exactly the model's known-bad fixture, so on-chain behaviour == golden.
 *
 *   POST /infer { input:number[3], requestId } → commits R, returns output + roots
 *   POST /open  { requestId, spec }            → encoded pathProof hex
 *
 * Honest and cheat are the SAME code path modulo the `cheat` flag: the cheat is
 * not a special opening, it is a corrupted trace that fails honest opening.
 */
import express from "express";
import type { Server } from "node:http";
import type { Address, Hex } from "viem";

import { forward, commit, openPath, encodePathProof, weightRoot, CORRUPT_NODE, type PathSpec } from "@proof/model";
import { toFixed, fromFixed, type Fixed } from "@proof/shared";

import {
  publicClient,
  makeIdentity,
  CONTRACTS,
  registryAbi,
  challengeManagerAbi,
  STAKE,
  feltToBytes32,
  outputHashOf,
  bytesToHex,
} from "./chain.js";

/**
 * The corrupt-trace delta — MUST match `buildBadFixture` (+= 1000n at CORRUPT_NODE)
 * so a cheating provider's on-chain commitment equals the golden known-bad root.
 */
const CORRUPT_DELTA = 1000n;

export interface Inference {
  trace: Fixed[][];
  output: Fixed[];
  traceRoot: bigint;
  weightRoot: bigint;
  outputHash: Hex;
}

/**
 * Pure inference + commitment computation (no chain, no HTTP — unit-testable).
 * `cheat` flips one activation after the forward pass and recommits R over the
 * corrupt trace, mirroring `buildBadFixture`. The output vector is unchanged
 * (the corruption is at a hidden layer), so `outputHash` binds the honest output.
 */
export function computeInference(input: Fixed[], cheat: boolean): Inference {
  const { trace: honest, output } = forward(input);
  let trace = honest;
  if (cheat) {
    trace = honest.map((layer) => [...layer]);
    trace[CORRUPT_NODE.layer]![CORRUPT_NODE.index]! += CORRUPT_DELTA;
  }
  const traceRoot = commit(trace);
  return { trace, output, traceRoot, weightRoot: weightRoot(), outputHash: outputHashOf(output) };
}

interface StoredTrace {
  trace: Fixed[][];
  traceRoot: bigint;
  weightRoot: bigint;
}

export interface ProviderConfig {
  /** When true, corrupt a single neuron's activation to simulate a cheaper model. */
  cheat: boolean;
  /** HTTP port for the provider's inference service. */
  port: number;
  /** Funded Sepolia private key for this provider identity. */
  privateKey: string;
}

export interface ProviderHandle {
  address: Address;
  port: number;
  url: string;
  cheat: boolean;
  /** Register + stake if not already active in the Registry. */
  ensureRegistered(): Promise<void>;
  close(): Promise<void>;
}

/** Start a provider HTTP service backed by an on-chain identity. */
export async function createProvider(config: ProviderConfig): Promise<ProviderHandle> {
  const { cheat, port } = config;
  const id = makeIdentity(config.privateKey);
  const store = new Map<Hex, StoredTrace>();

  async function ensureRegistered(): Promise<void> {
    const active = (await publicClient.readContract({
      address: CONTRACTS.Registry,
      abi: registryAbi,
      functionName: "isActive",
      args: [id.address],
    })) as boolean;
    if (active) return;
    const hwRoot = feltToBytes32(weightRoot());
    const hash = await id.wallet.writeContract({
      address: CONTRACTS.Registry,
      abi: registryAbi,
      functionName: "register",
      args: [hwRoot],
      value: STAKE,
      account: id.account,
      chain: id.wallet.chain,
    });
    await publicClient.waitForTransactionReceipt({ hash });
  }

  const app = express();
  app.use(express.json());

  // POST /infer — run the model, commit R on-chain, return the result.
  app.post("/infer", async (req, res) => {
    try {
      const { input, requestId } = req.body as { input: number[]; requestId: Hex };
      if (!Array.isArray(input) || input.length !== 3) {
        return res.status(400).json({ error: "input must be number[3]" });
      }
      if (!requestId) return res.status(400).json({ error: "requestId required" });

      const inputFixed: Fixed[] = input.map(toFixed);
      const inf = computeInference(inputFixed, cheat);
      const traceRootHex = feltToBytes32(inf.traceRoot);

      const commitTx = await id.wallet.writeContract({
        address: CONTRACTS.ChallengeManager,
        abi: challengeManagerAbi,
        functionName: "commit",
        args: [requestId, traceRootHex, inf.outputHash],
        account: id.account,
        chain: id.wallet.chain,
      });
      await publicClient.waitForTransactionReceipt({ hash: commitTx });

      store.set(requestId, { trace: inf.trace, traceRoot: inf.traceRoot, weightRoot: inf.weightRoot });

      res.json({
        requestId,
        output: inf.output.map(fromFixed),
        traceRoot: traceRootHex,
        outputHash: inf.outputHash,
        commitTx,
      });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // POST /open — open the requested path over the trace this provider actually served.
  app.post("/open", (req, res) => {
    const { requestId, spec } = req.body as { requestId: Hex; spec: PathSpec };
    const stored = store.get(requestId);
    if (!stored) return res.status(404).json({ error: "unknown requestId" });
    const proof = openPath(spec, stored.trace, stored.traceRoot, stored.weightRoot);
    res.json({ pathProof: bytesToHex(encodePathProof(proof)) });
  });

  const server: Server = await new Promise((resolve) => {
    const s = app.listen(port, () => resolve(s));
  });

  return {
    address: id.address,
    port,
    url: `http://localhost:${port}`,
    cheat,
    ensureRegistered,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
