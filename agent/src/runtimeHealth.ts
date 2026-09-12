export type TreasuryPipelineStage = "observe" | "prove" | "reason" | "authorize" | "execute";
export type TreasuryPipelineStatus = "working" | "waiting" | "blocked" | "executed" | "failed";

export interface TreasuryPipelineSnapshot {
  treasury: string;
  stage: TreasuryPipelineStage;
  status: TreasuryPipelineStatus;
  detail: string;
  cycleId: string;
  updatedAt: string;
}

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
  treasuryPipelines: Record<string, TreasuryPipelineSnapshot>;
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
  treasuryPipelines: {},
};

export function updateRuntimeHealth(patch: Partial<RuntimeHealthSnapshot>): void {
  Object.assign(health, patch);
}

export function updateTreasuryPipeline(
  treasury: string,
  patch: Omit<Partial<TreasuryPipelineSnapshot>, "treasury" | "updatedAt"> & Pick<TreasuryPipelineSnapshot, "stage" | "status" | "detail" | "cycleId">,
): void {
  const key = treasury.toLowerCase();
  health.treasuryPipelines[key] = {
    treasury,
    stage: patch.stage,
    status: patch.status,
    detail: patch.detail,
    cycleId: patch.cycleId,
    updatedAt: new Date().toISOString(),
  };
}

export function patchTreasuryPipeline(
  treasury: string,
  patch: Partial<Omit<TreasuryPipelineSnapshot, "treasury" | "updatedAt">>,
): void {
  const key = treasury.toLowerCase();
  const current = health.treasuryPipelines[key];
  if (!current) return;
  health.treasuryPipelines[key] = {
    ...current,
    ...patch,
    treasury,
    updatedAt: new Date().toISOString(),
  };
}

export function runtimeHealthSnapshot(): RuntimeHealthSnapshot {
  return {
    ...health,
    treasuryPipelines: { ...health.treasuryPipelines },
  };
}
