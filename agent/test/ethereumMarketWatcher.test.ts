import { describe, it, expect, vi } from "vitest";
import { EthereumMarketWatcher, type EthereumEndpoint } from "../src/ethereumMarketWatcher.js";

// Coverage for endpoint failover after public source RPCs degraded in waves
// on 2026-09-02 (bogus eth_getLogs range errors, request timeouts) and repeatedly stalled
// every evaluation cycle even though a backup endpoint was healthy at the same moment.

function stubEndpoint(name: string, impl: {
  getBlockNumber?: () => Promise<number>;
  queryFilter?: () => Promise<unknown[]>;
}): EthereumEndpoint & { name: string } {
  return {
    name,
    provider: {
      getBlockNumber: impl.getBlockNumber ?? vi.fn(async () => 42),
      getNetwork: vi.fn(async () => ({ chainId: 1n })),
    },
    contract: {
      filters: { MarketPriceObserved: () => "filter" },
      queryFilter: impl.queryFilter ?? vi.fn(async () => []),
    },
  } as unknown as EthereumEndpoint & { name: string };
}

function makeEvent(block: number, price: bigint) {
  return {
    blockNumber: block,
    transactionIndex: 0,
    transactionHash: `0x${block}`,
    args: {
      priceE6: price,
      arithmeticMeanTick: 0n,
      spotSqrtPriceX96: 1n << 96n,
      liquidity: 1n,
      reporter: "0x0000000000000000000000000000000000000002",
    },
  };
}

describe("EthereumMarketWatcher endpoint failover", () => {
  it("falls through to a healthy backup when the pinned primary read fails, and pins the backup", async () => {
    const a = stubEndpoint("a", { getBlockNumber: vi.fn(async () => { throw new Error("boom"); }) });
    const b = stubEndpoint("b", {
      getBlockNumber: vi.fn(async () => 100),
      queryFilter: vi.fn(async () => [makeEvent(99, 1_010_000n)]),
    });
    const w = new EthereumMarketWatcher([a, b]);

    const obs = await w.pollLatest(20);
    expect(obs?.blockHeight).toBe(99);
    expect(obs?.price).toBe(1_010_000n);

    // the healthy backup is now pinned: the NEXT read must hit it first, not A again
    expect((a.provider.getBlockNumber as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(1);
    await w.currentBlockNumber();
    expect((a.provider.getBlockNumber as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(1); // unchanged
    expect((b.provider.getBlockNumber as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(2);
  });

  it("throws the last endpoint's error only after every endpoint failed", async () => {
    const a = stubEndpoint("a", { getBlockNumber: vi.fn(async () => { throw new Error("a down"); }) });
    const b = stubEndpoint("b", { getBlockNumber: vi.fn(async () => { throw new Error("b down"); }) });
    const w = new EthereumMarketWatcher([a, b]);

    await expect(w.currentBlockNumber()).rejects.toThrow("b down");
  });

  it("does not advance lastScannedBlock when the whole read fails, so no observation is skipped", async () => {
    const good = stubEndpoint("good", {
      getBlockNumber: vi.fn(async () => 100),
      queryFilter: vi.fn(async () => [makeEvent(98, 1_011_000n)]),
    });
    const w = new EthereumMarketWatcher([good]);

    // first call succeeds and pins the scan cursor at 101
    await w.pollLatest(20);
    const qf = good.contract.queryFilter as ReturnType<typeof vi.fn>;
    expect(qf.mock.calls[0].slice(1)).toEqual([80, 100]);

    // failure #1: the event query itself dies after a successful head read
    qf.mockImplementationOnce(async () => { throw new Error("down 1"); });
    await expect(w.pollLatest(20)).rejects.toThrow("down 1");

    // failure #2: the head read dies
    good.provider.getBlockNumber = vi.fn(async () => { throw new Error("down 2"); });
    await expect(w.pollLatest(20)).rejects.toThrow("down 2");

    // recovery: the cursor must STILL be 101 — failed attempts must not skip a window
    good.provider.getBlockNumber = vi.fn(async () => 110);
    await w.pollLatest(20);
    expect(qf.mock.calls[2].slice(1)).toEqual([101, 110]);
  });

  it("rejects construction with zero endpoints", () => {
    expect(() => new EthereumMarketWatcher([])).toThrow("at least one RPC endpoint");
  });

  it("rejects an endpoint whose actual chain is not Ethereum mainnet", async () => {
    const wrong = stubEndpoint("wrong-chain", {});
    wrong.provider.getNetwork = vi.fn(async () => ({ chainId: 11155111n })) as never;
    const w = new EthereumMarketWatcher([wrong]);
    await expect(w.currentBlockNumber()).rejects.toThrow("chainId 1");
  });

  it("keeps working with injected stubs shaped like the real endpoint slice", async () => {
    // guards the narrow structural contract (Pick<...>) the tests rely on
    const e: EthereumEndpoint = stubEndpoint("real-shaped", {}) as unknown as EthereumEndpoint;
    const w = new EthereumMarketWatcher([e]);
    await expect(w.currentBlockNumber()).resolves.toBe(42);
  });
});
