export interface RuntimeHealthSnapshot {
  startedAt: string;
  lastCycleStartedAt: string | null;
  lastSuccessfulCycleAt: string | null;
  lastSourceObservationAt: string | null;
  lastSourceObservationBlock: string | null;
  lastProofBuiltAt: string | null;
  lastFactoryScanAt: string | null;
  indexedTreasuryCount: number;
  lastProposalResolvedAt: string | null;
  lastError: string | null;
}

const health: RuntimeHealthSnapshot = {
  startedAt: new Date().toISOString(),
  lastCycleStartedAt: null,
  lastSuccessfulCycleAt: null,
  lastSourceObservationAt: null,
  lastSourceObservationBlock: null,
  lastProofBuiltAt: null,
  lastFactoryScanAt: null,
  indexedTreasuryCount: 0,
  lastProposalResolvedAt: null,
  lastError: null,
};

export function updateRuntimeHealth(patch: Partial<RuntimeHealthSnapshot>): void {
  Object.assign(health, patch);
}

export function runtimeHealthSnapshot(): RuntimeHealthSnapshot {
  return { ...health };
}
