/** Provider agent (SCAFFOLD — Phase 2). Honest by default; `cheat` corrupts one neuron. */
export interface ProviderConfig {
  /** When true, corrupt a single neuron's activation to simulate serving a cheaper model. */
  cheat: boolean;
}

export function createProvider(_config: ProviderConfig): never {
  throw new Error("not implemented (Phase 2)");
}
