import type {
  Candidate,
  MandateSnapshot,
  StrategyType,
  VerifiedContext,
} from "../domain/index.js";

/**
 * A strategy interprets typed context and produces intent. It cannot execute,
 * mutate the mandate, or return arbitrary transaction instructions.
 */
export interface Strategy<C extends Candidate = Candidate> {
  readonly type: StrategyType;
  evaluate(context: VerifiedContext, mandate: MandateSnapshot): C | null;
}
