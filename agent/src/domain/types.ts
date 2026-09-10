/** Closed domain vocabulary shared by every future Fair Witness strategy. */
export enum StrategyType {
  ARBITRAGE = 0,
  REBALANCE = 1,
  RISK_REDUCTION = 2,
}

/** Phase 1 deliberately exposes one non-programmable execution primitive. */
export enum ActionType {
  SWAP_EXACT_IN = 0,
}

export enum DecisionOutcome {
  EXECUTE = "EXECUTE",
  WAIT = "WAIT",
}

export enum TradeDirection {
  SELL_WCTC = 0,
  BUY_WCTC = 1,
}

export enum AutomationMode {
  PAUSED = 0,
  AUTONOMOUS = 1,
}

export type Address = `0x${string}`;
export type Hex32 = `0x${string}`;

export const ALL_STRATEGIES_MASK =
  (1 << StrategyType.ARBITRAGE) |
  (1 << StrategyType.REBALANCE) |
  (1 << StrategyType.RISK_REDUCTION);

export function isStrategyType(value: unknown): value is StrategyType {
  return (
    value === StrategyType.ARBITRAGE ||
    value === StrategyType.REBALANCE ||
    value === StrategyType.RISK_REDUCTION
  );
}

export function strategyBit(strategy: StrategyType): number {
  return 1 << strategy;
}

export function isStrategyEnabled(mask: number, strategy: StrategyType): boolean {
  return (mask & strategyBit(strategy)) !== 0;
}

export interface ChainPosition {
  chainKey: bigint;
  blockHeight: bigint;
  transactionIndex: bigint;
  transactionHash: string;
}

export interface VerifiedSourceObservation extends ChainPosition {
  reporter: Address;
  arithmeticMeanTick: bigint;
  spotSqrtPriceX96: bigint;
  liquidity: bigint;
  priceE6: bigint;
}

export interface VerifiedEvidenceContext {
  evidenceHash: Hex32;
  source: VerifiedSourceObservation;
  confirmation: VerifiedSourceObservation;
}

export interface DestinationMarketState {
  readBlockNumber: bigint;
  twapPriceE6: bigint;
  spotPriceE6: bigint;
  arithmeticMeanTick: bigint;
  liquidity: bigint;
  poolFee: number;
}

export interface PortfolioSnapshot {
  readBlockNumber: bigint;
  wctcBalance: bigint;
  stableBalance: bigint;
  dailyRiskReductionUsedE6: bigint;
}

/**
 * AI-visible evaluation context. It helps construct a candidate but is not an
 * authorization artifact: the treasury will reverify evidence and reread all
 * security-critical destination state in later phases.
 */
export interface VerifiedContext {
  treasuryAddress: Address;
  observationHash: Hex32;
  evidence: VerifiedEvidenceContext;
  destination: DestinationMarketState;
  portfolio: PortfolioSnapshot;
}

export interface UniversalPolicySnapshot {
  enabledStrategies: number;
  maxActionValueE6: bigint;
  maxSlippageBps: number;
  maxSourceDriftBps: number;
  maxSpotTwapDeviationBps: number;
  minSourceLiquidity: bigint;
  minDestinationLiquidity: bigint;
  maxExecutionsPerEpoch: number;
  epochLength: number;
  maxAttemptsPerEpoch: number;
}

export interface ArbitragePolicySnapshot {
  minNetEdgeBps: number;
  maxArbitrageValueE6: bigint;
}

export interface RebalancePolicySnapshot {
  targetWctcBps: number;
  toleranceBps: number;
  maxRebalanceValueE6: bigint;
}

export interface RiskPolicySnapshot {
  maxWctcExposureBps: number;
  maxRiskReductionValueE6: bigint;
  dailyRiskReductionValueE6: bigint;
}

export interface MandateSnapshot {
  treasuryAddress: Address;
  wctc: Address;
  stable: Address;
  venue: Address;
  policyHash: Hex32;
  policyEpoch: bigint;
  automationMode: AutomationMode;
  universal: UniversalPolicySnapshot;
  arbitrage: ArbitragePolicySnapshot;
  rebalance: RebalancePolicySnapshot;
  risk: RiskPolicySnapshot;
}

export interface ArbitrageMetrics {
  kind: StrategyType.ARBITRAGE;
  sourcePriceE6: bigint;
  confirmationPriceE6: bigint;
  destinationTwapPriceE6: bigint;
  destinationSpotPriceE6: bigint;
  sourceDriftBps: number;
  spotTwapDeviationBps: number;
  grossEdgeBps: number;
  poolFeeBps: number;
  effectiveSlippageBps: number;
  executionReserveBps: number;
  netEdgeBps: number;
}

export interface RebalanceMetrics {
  kind: StrategyType.REBALANCE;
  portfolioValueE6: bigint;
  wctcValueE6: bigint;
  currentWctcBps: number;
  targetWctcBps: number;
  toleranceBps: number;
  deviationBps: number;
  requiredAdjustmentE6: bigint;
}

export interface RiskReductionMetrics {
  kind: StrategyType.RISK_REDUCTION;
  portfolioValueE6: bigint;
  wctcValueE6: bigint;
  currentWctcBps: number;
  maxWctcExposureBps: number;
  excessValueE6: bigint;
  remainingDailyReductionE6: bigint;
}

export type TypedStrategyMetrics =
  | ArbitrageMetrics
  | RebalanceMetrics
  | RiskReductionMetrics;

interface CandidateBase<T extends StrategyType, M extends TypedStrategyMetrics> {
  strategy: T;
  action: ActionType.SWAP_EXACT_IN;
  evidenceHash: Hex32;
  observationHash: Hex32;
  policyHash: Hex32;
  direction: TradeDirection;
  deterministicAmountIn: bigint;
  permittedValueE6: bigint;
  metrics: M;
}

export type ArbitrageCandidate = CandidateBase<
  StrategyType.ARBITRAGE,
  ArbitrageMetrics
>;
export type RebalanceCandidate = CandidateBase<
  StrategyType.REBALANCE,
  RebalanceMetrics
>;
export type RiskReductionCandidate = CandidateBase<
  StrategyType.RISK_REDUCTION,
  RiskReductionMetrics
>;

export type Candidate =
  | ArbitrageCandidate
  | RebalanceCandidate
  | RiskReductionCandidate;

/** The complete future AI output. It intentionally contains no execution term. */
export interface AiDecision {
  decision: DecisionOutcome;
  strategy: StrategyType;
  rationale: string;
  reasonTags: readonly string[];
}
