import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repo = resolve(process.cwd(), "..");
const audit = readFileSync(resolve(repo, "contracts/script/audit-live-path.js"), "utf8");
const marketController = readFileSync(resolve(repo, "contracts/script/control-demo-market.js"), "utf8");
const strategySmoke = readFileSync(resolve(repo, "agent/src/controlledDemoStrategySmoke.ts"), "utf8");
const frontendControlledDemo = readFileSync(resolve(repo, "frontend/src/lib/controlledDemo.ts"), "utf8");
const manifest = JSON.parse(readFileSync(resolve(repo, "contracts/deployments/schema-v1.candidate.json"), "utf8"));
const controlled = JSON.parse(
  readFileSync(resolve(repo, "contracts/deployments/controlled-demo-schema-v1.json"), "utf8"),
);

describe("Phase 10 fail-closed deployment preparation", () => {
  it("keeps the live readiness audit read-only and free of signing primitives", () => {
    expect(audit).toContain("READ_ONLY_NO_BROADCAST");
    expect(audit).not.toMatch(/new ethers(?:Mod)?\.Wallet/);
    expect(audit).not.toMatch(/\.sendTransaction\s*\(/);
    expect(audit).not.toMatch(/\.broadcast\s*\(/);
  });

  it("pins exact networks, Attestcoin precompiles and economic-claim boundaries", () => {
    expect(manifest.source.chainId).toBe("11155111");
    expect(manifest.destination.chainId).toBe("102031");
    expect(manifest.destination.blockProver.toLowerCase().endsWith("0fd2")).toBe(true);
    expect(manifest.destination.chainInfo.toLowerCase().endsWith("0fd3")).toBe(true);
    expect(manifest.claims.naturallyOccurringArbitrage).toBe(false);
    expect(manifest.claims.productionProfitability).toBe(false);
  });

  it("cannot become broadcast-ready while dependencies, roles or policy review are unresolved", () => {
    expect(manifest.status).toBe("SUPERSEDED_BY_CONTROLLED_DEMO_AMENDMENT");
    expect(manifest.source.pool).toBeNull();
    expect(manifest.roles.ownerAgentSeparated).toBe(false);
    expect(manifest.mandate.approved).toBe(false);
    expect(manifest.mandate.automationMode).toBe("PAUSED");
    expect(manifest.blockers.length).toBeGreaterThan(0);
  });
});

describe("Phase 10 controlled-demo deployment record", () => {
  it("records deployed schema-v1 contracts without making economic or bridge claims", () => {
    expect(controlled.status).toBe("DEPLOYED_PAUSED_VERIFIED");
    expect(controlled.label).toContain("Controlled demonstration markets and liquidity");
    expect(controlled.claims.environment).toBe("PUBLIC_TESTNET_CONTROLLED_DEMO");
    expect(controlled.claims.naturallyOccurringArbitrage).toBe(false);
    expect(controlled.claims.productionProfitability).toBe(false);
    expect(controlled.claims.bridgedOrRedeemableTokens).toBe(false);
  });

  it("pins genuine Attestcoin precompiles, distinct roles and paused automation", () => {
    expect(controlled.destination.blockProver.toLowerCase().endsWith("0fd2")).toBe(true);
    expect(controlled.destination.chainInfo.toLowerCase().endsWith("0fd3")).toBe(true);
    expect(controlled.roles.ownerAgentSeparated).toBe(true);
    expect(controlled.roles.deployer).not.toBe(controlled.roles.treasuryOwner);
    expect(controlled.destination.readback.owner).toBe(controlled.roles.treasuryOwner);
    expect(controlled.destination.readback.automationMode).toBe(0);
    expect(controlled.destination.readback.deployerRegisteredAsAgent).toBe(true);
    expect(controlled.mandate.automationMode).toBe("PAUSED");
    expect(controlled.finalReadback.attemptCount).toBe(6);
    expect(controlled.finalReadback.executionCount).toBe(4);
    expect(controlled.smokeTests.map((entry: { name: string }) => entry.name)).toEqual(expect.arrayContaining([
      "VALID_ATTESTCOIN_RISK_REDUCTION",
      "OVERSIZED_ATTESTCOIN_RISK_REJECTION",
      "CONTROLLED_ATTESTCOIN_ARBITRAGE",
      "CONTROLLED_ATTESTCOIN_REBALANCE",
      "PUBLIC_REQUEST_ATTESTCOIN_ARBITRAGE",
    ]));
  });

  it("records the required opposite V3 token order and usable oracle state", () => {
    expect(BigInt(controlled.source.stable)).toBeLessThan(BigInt(controlled.source.wctc));
    expect(BigInt(controlled.destination.wctc)).toBeLessThan(BigInt(controlled.destination.stable));
    expect(Number(controlled.source.observerReadback.cardinality)).toBeGreaterThanOrEqual(16);
    expect(BigInt(controlled.source.observerReadback.liquidity)).toBeGreaterThan(0n);
    expect(BigInt(controlled.destination.readback.destinationLiquidity)).toBeGreaterThan(0n);
    expect(controlled.mandate.expectedPolicyHash).toBe(controlled.destination.readback.policyHash);
  });

  it("keeps release-facing frontend addresses bound to the frozen manifest", () => {
    const publishedAddresses = [
      controlled.source.pool,
      controlled.source.observer,
      controlled.source.stable,
      controlled.source.wctc,
      controlled.destination.pool,
      controlled.destination.wctc,
      controlled.destination.stable,
      controlled.destination.adapter,
      controlled.destination.validator,
      controlled.destination.factory,
      controlled.destination.treasury,
      controlled.roles.treasuryOwner,
      controlled.roles.agentSubmitter,
    ];

    for (const address of publishedAddresses) {
      expect(frontendControlledDemo.toLowerCase()).toContain(address.toLowerCase());
    }
  });
});

describe("Phase 11 controlled-market operator boundary", () => {
  it("is preview-only by default, manifest-bound, price-bounded and clears approval", () => {
    expect(marketController).toContain('"PREVIEW_ONLY"');
    expect(marketController).toContain("controlled-demo-schema-v1.json");
    expect(marketController).toContain("priceE6 < 500_000n || priceE6 > 2_000_000n");
    expect(marketController).toContain("input.approve(routerAddress, 0)");
    expect(marketController).toContain("Controlled demonstration markets and liquidity");
  });

  it("uses pool swaps and never exposes a caller-supplied observer price", () => {
    expect(marketController).toContain("exactInputSingle");
    expect(marketController).toContain("sqrtPriceLimitX96: target");
    expect(marketController).toContain("SEPOLIA_ROUTER_ABI");
    expect(marketController).toContain("PENGUIN_ROUTER_ABI");
    expect(marketController).not.toContain("observer.observe(");
    expect(marketController).not.toContain("setPrice");
  });

  it("uses each deployed router's exact tuple and keeps schema-v1 AI output non-executable", () => {
    expect(marketController).toContain("uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96");
    expect(marketController).toContain("uint256 deadline,uint256 amountIn,uint256 amountOutMinimum");
    expect(strategySmoke).toContain("parseAiDecision");
    expect(strategySmoke).toContain("decision.decision !== DecisionOutcome.EXECUTE");
    expect(strategySmoke).toContain("submitProposal.staticCall");
    expect(strategySmoke).toContain("setAutomationMode(0)");
    expect(strategySmoke).not.toMatch(/decision\.(amount|asset|venue|slippage|route|recipient|calldata)/);
  });
});
