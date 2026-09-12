// Schema-v1 ABI exports for product contract interactions.
// Keep legacy artifacts out of the production path so onboarding cannot
// accidentally deploy the pre-schema arbitrage treasury.
import factoryArtifact from "../abi/FairWitnessTreasuryFactory.json";
import treasuryArtifact from "../abi/FairWitnessTreasury.json";

export const FAIR_WITNESS_FACTORY_ABI = (factoryArtifact as any).abi ?? factoryArtifact;
export const FAIR_WITNESS_TREASURY_ABI = (treasuryArtifact as any).abi ?? treasuryArtifact;
