import { describe, expect, it } from "vitest"
import { CONTROLLED_DEMO, CONTROLLED_DEMO_LABEL } from "./controlledDemo"

describe("controlled demo disclosure and pinned deployment", () => {
  it("forbids bridge, natural-arbitrage and profitability implications", () => {
    expect(CONTROLLED_DEMO_LABEL).toContain("do not represent a production bridge")
    expect(CONTROLLED_DEMO_LABEL).toContain("natural arbitrage")
    expect(CONTROLLED_DEMO_LABEL).toContain("economic profitability")
  })
  it("pins distinct owner and agent plus the deployed treasury", () => {
    expect(CONTROLLED_DEMO.owner).not.toBe(CONTROLLED_DEMO.agent)
    expect(CONTROLLED_DEMO.destination.chainId).toBe(102031)
    expect(CONTROLLED_DEMO.destination.treasury).toBe("0x7fF88afF5D8AEA666582730AD81F49b3C303A3d3")
  })
  it("pins public receipts for all three strategies and the oversized rejection", () => {
    expect(CONTROLLED_DEMO.arbitrageSmoke.execution).toMatch(/^0x[0-9a-f]{64}$/)
    expect(CONTROLLED_DEMO.rebalanceSmoke.execution).toMatch(/^0x[0-9a-f]{64}$/)
    expect(CONTROLLED_DEMO.riskSmoke.execution).toMatch(/^0x[0-9a-f]{64}$/)
    expect(CONTROLLED_DEMO.oversizedRiskRejection).toMatch(/^0x[0-9a-f]{64}$/)
    expect(CONTROLLED_DEMO.publicRequestSmoke.execution).toMatch(/^0x[0-9a-f]{64}$/)
    expect(CONTROLLED_DEMO.publicRequestSmoke.attemptId).toBe(6)
  })
})
