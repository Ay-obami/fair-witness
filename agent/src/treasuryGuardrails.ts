import { ethers } from "ethers";
import { config } from "./config.js";
import treasuryAbi from "./abi/ASCTreasuryJournal.json" with { type: "json" };
import factoryAbi from "./abi/ASCTreasuryFactory.json" with { type: "json" };

/**
 * Immutable guardrails for a factory-deployed treasury instance.
 * These are baked into the contract at construction time and cannot be changed.
 */
export interface TreasuryGuardrails {
  owner: string;
  maxTradeSize: bigint;
  maxSlippageBps: bigint;
  minArbWidthBps: bigint;
  maxDriftBps: bigint;
  maxConfirmGapBlocks: bigint;
  maxActionsPerEpoch: bigint;
  epochLength: bigint;
}

/**
 * Reads the immutable guardrails from a factory-deployed treasury instance.
 * This is the authoritative source for tenant-specific bounds in a multi-tenant setup.
 */
export async function readTreasuryGuardrails(
  provider: ethers.JsonRpcProvider,
  treasuryAddress: string
): Promise<TreasuryGuardrails> {
  const treasury = new ethers.Contract(treasuryAddress, treasuryAbi.abi, provider);

    const [
    owner,
    maxTradeSize,
    maxSlippageBps,
    minArbWidthBps,
    maxDriftBps,
    maxConfirmGapBlocks,
    maxActionsPerEpoch,
    epochLength,
  ] = await Promise.all([
    treasury.owner(),
    treasury.MAX_TRADE_SIZE(),
    treasury.MAX_SLIPPAGE_BPS(),
    treasury.MIN_ARB_WIDTH_BPS(),
    treasury.MAX_DRIFT_BPS(),
    treasury.MAX_CONFIRM_GAP_BLOCKS(),
    treasury.MAX_ACTIONS_PER_EPOCH(),
    treasury.EPOCH_LENGTH(),
  ]);

  return {
    owner,
    maxTradeSize,
    maxSlippageBps,
    minArbWidthBps,
    maxDriftBps,
    maxConfirmGapBlocks,
    maxActionsPerEpoch,
    epochLength,
  };
}

/**
 * Gets the treasury address from either FACTORY_ADDRESS + tenant ID or direct TREASURY_ADDRESS.
 * For multi-tenant support, set FACTORY_ADDRESS and TENANT_ID (which is the owner address).
 * For single-tenant setups, just set TREASURY_ADDRESS directly.
 * 
 * Note: The factory doesn't currently expose a tenant-to-treasury lookup. In multi-tenant mode,
 * the TENANT_ID should be the owner address, and we use a deterministic approach or an
 * external registry to resolve it. For now, the resolved treasury address can be passed
 * directly via TREASURY_ADDRESS when using the factory.
 */
export async function resolveTreasuryAddress(
  tenantId?: string
): Promise<string> {
  // Direct mode: use TREASURY_ADDRESS directly
  if (config.treasuryAddress) {
    return config.treasuryAddress;
  }

  // Factory mode: use FACTORY_ADDRESS + tenantId
  // The factory currently doesn't have a tenantTreasury() lookup, so we require
  // TREASURY_ADDRESS to be set in this mode, OR the caller can pass the address directly
  if (config.factoryAddress && tenantId) {
    throw new Error(
      `Multi-tenant mode requires TREASURY_ADDRESS to be explicitly set for tenant ${tenantId}. ` +
      `The factory does not yet expose a tenant-to-treasury registry. ` +
      `Set TREASURY_ADDRESS=0x... in the tenant's .env to specify which instance they own.`
    );
  }

  throw new Error(
    "Either TREASURY_ADDRESS must be set, or both FACTORY_ADDRESS and TENANT_ID must be set with a known treasury address"
  );
}