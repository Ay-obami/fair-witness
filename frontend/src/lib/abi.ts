// ABI exports for frontend contract interactions.
// Sourced from Foundry build artifacts to stay in sync with on-chain contracts.
import factoryArtifact from "../abi/ASCTreasuryFactory.json";
import journalArtifact from "../abi/ASCTreasuryJournal.json";

export const FACTORY_ABI = (factoryArtifact as any).abi ?? factoryArtifact;
export const JOURNAL_ABI = (journalArtifact as any).abi ?? journalArtifact;
