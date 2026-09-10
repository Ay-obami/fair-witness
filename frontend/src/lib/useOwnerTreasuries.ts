import { useCallback, useEffect, useMemo, useState } from "react";
import { ethers } from "ethers";
import { config } from "./config";
import { FAIR_WITNESS_FACTORY_ABI, FAIR_WITNESS_TREASURY_ABI } from "./abi";
import { fetchInstancesForWallet } from "./instanceStore";
import { humanError } from "./humanError";

export interface ActivityItem {
  attemptId: string;
  result: number;
  reason: number;
  strategy: number;
  evidenceStatus: number;
  submittedAt: number;
  resolvedAt: number;
  proposalId: string;
  proposedAmountIn: bigint;
  permittedValueE6: bigint;
  amountInActual: bigint;
  amountOutActual: bigint;
  currentWctcBps: number;
  referenceBps: number;
  assetIn: string;
  assetOut: string;
}

export interface TreasuryView {
  address: string;
  owner: string;
  automationMode: number;
  policyHash: string;
  policyEpoch: bigint;
  registered: boolean;
  wctc: string;
  stable: string;
  wctcBalance: bigint;
  stableBalance: bigint;
  universal: any;
  arbitrage: any;
  rebalance: any;
  risk: any;
  createdBlock?: number;
  createdAt?: number;
  activities: ActivityItem[];
}

const DEFAULT_FACTORY_DEPLOYMENT_BLOCK = 5_456_821;
const LOG_CHUNK_SIZE = 25_000;
const ACTIVITY_BATCH_SIZE = 20;
const cache = new Map<string, TreasuryView[]>();

export function useOwnerTreasuries(owner?: string, requestedTreasury?: string | null) {
  const key = owner?.toLowerCase() ?? "";
  const provider = useMemo(() => new ethers.JsonRpcProvider(config.creditcoinRpcUrl), []);
  const factory = useMemo(() => new ethers.Contract(config.factoryAddress, FAIR_WITNESS_FACTORY_ABI, provider), [provider]);
  const [treasuries, setTreasuries] = useState<TreasuryView[]>(() => key ? cache.get(key) ?? [] : []);
  const [loading, setLoading] = useState(() => Boolean(key) && !(cache.get(key)?.length));
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null);

  const readActivities = useCallback(async (c: ethers.Contract): Promise<ActivityItem[]> => {
    try {
      const count = Number(await c.attemptCount());
      if (count === 0) return [];

      // Attempt records are append-only on-chain. Read the complete journal instead of
      // silently replacing older entries with a fixed latest-10 window. Batch RPC calls
      // so a long-lived treasury does not create one huge request burst.
      const records: any[] = [];
      for (let newest = count; newest >= 1; newest -= ACTIVITY_BATCH_SIZE) {
        const oldest = Math.max(1, newest - ACTIVITY_BATCH_SIZE + 1);
        const ids = Array.from({ length: newest - oldest + 1 }, (_, i) => newest - i);
        records.push(...await Promise.all(ids.map((id) => c.getAttempt(id))));
      }

      return records.map((r: any) => ({
        attemptId: String(r.attemptId),
        result: Number(r.result),
        reason: Number(r.reason),
        strategy: Number(r.strategy),
        evidenceStatus: Number(r.evidenceStatus),
        submittedAt: Number(r.submittedAt),
        resolvedAt: Number(r.resolvedAt),
        proposalId: String(r.proposalId),
        proposedAmountIn: BigInt(r.proposedAmountIn),
        permittedValueE6: BigInt(r.permittedValueE6),
        amountInActual: BigInt(r.amountInActual),
        amountOutActual: BigInt(r.amountOutActual),
        currentWctcBps: Number(r.currentWctcBps),
        referenceBps: Number(r.referenceBps),
        assetIn: String(r.assetIn),
        assetOut: String(r.assetOut),
      }));
    } catch {
      return [];
    }
  }, []);

  const readTreasury = useCallback(async (address: string, createdBlock?: number): Promise<TreasuryView> => {
    const normalized = ethers.getAddress(address);
    const c = new ethers.Contract(normalized, FAIR_WITNESS_TREASURY_ABI, provider);
    const [ownerAddress, mode, hash, epoch, registered, wctc, stable, universal, arbitrage, risk, rebalance, activities] = await Promise.all([
      c.owner(), c.automationMode(), c.currentPolicyHash(), c.policyEpoch(), c.registeredAgents(config.agentSubmitAddress),
      c.WCTC(), c.STABLE(), c.universalPolicy(), c.arbitragePolicy(), c.riskPolicy(), c.rebalancePolicy(), readActivities(c),
    ]);
    const tokenAbi = ["function balanceOf(address) view returns(uint256)"];
    const [wctcBalance, stableBalance] = await Promise.all([
      new ethers.Contract(wctc, tokenAbi, provider).balanceOf(normalized),
      new ethers.Contract(stable, tokenAbi, provider).balanceOf(normalized),
    ]);
    let createdAt: number | undefined;
    if (createdBlock) {
      try { createdAt = (await provider.getBlock(createdBlock))?.timestamp; } catch { /* optional */ }
    }
    return {
      address: normalized, owner: ownerAddress, automationMode: Number(mode), policyHash: hash, policyEpoch: BigInt(epoch),
      registered: Boolean(registered), wctc, stable, wctcBalance: BigInt(wctcBalance), stableBalance: BigInt(stableBalance),
      universal, arbitrage, risk, rebalance, activities, createdBlock, createdAt,
    };
  }, [provider, readActivities]);

  const discover = useCallback(async (background = false) => {
    if (!owner) return;
    if (background || cache.get(key)?.length) setRefreshing(true); else setLoading(true);
    setError(null);
    try {
      const found = new Map<string, number | undefined>();
      if (requestedTreasury && ethers.isAddress(requestedTreasury)) {
        const address = ethers.getAddress(requestedTreasury);
        try { if (await factory.isFactoryTreasury(address)) found.set(address, undefined); } catch { /* continue */ }
      }

      const latest = await provider.getBlockNumber();
      const raw = import.meta.env.VITE_FACTORY_DEPLOYMENT_BLOCK?.trim();
      const configured = raw ? Number(raw) : DEFAULT_FACTORY_DEPLOYMENT_BLOCK;
      const first = Math.min(Number.isFinite(configured) ? configured : DEFAULT_FACTORY_DEPLOYMENT_BLOCK, latest);
      const filter = factory.filters.TreasuryCreated(null, owner, null);
      for (let from = first; from <= latest; from += LOG_CHUNK_SIZE) {
        try {
          const events = await factory.queryFilter(filter, from, Math.min(latest, from + LOG_CHUNK_SIZE - 1));
          for (const event of events) {
            if (event instanceof ethers.EventLog) found.set(ethers.getAddress(event.args.treasury), event.blockNumber);
          }
        } catch (e) { console.warn("factory log chunk failed", e); }
      }

      try {
        for (const row of await fetchInstancesForWallet(owner) ?? []) {
          if (!ethers.isAddress(row.instanceAddress)) continue;
          const address = ethers.getAddress(row.instanceAddress);
          if (!found.has(address)) found.set(address, undefined);
        }
      } catch { /* optional cache */ }

      const views = (await Promise.all([...found].map(async ([address, block]) => {
        try { return await readTreasury(address, block); } catch { return null; }
      }))).filter((v): v is TreasuryView => Boolean(v) && v!.owner.toLowerCase() === owner.toLowerCase())
        .sort((a, b) => (b.createdBlock ?? 0) - (a.createdBlock ?? 0));

      cache.set(key, views);
      setTreasuries(views);
      setRefreshedAt(new Date());
    } catch (e) {
      setError(humanError(e, "Treasury discovery failed. Please retry."));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [factory, key, owner, provider, readTreasury, requestedTreasury]);

  useEffect(() => {
    if (!owner) { setTreasuries([]); setLoading(false); return; }
    const cached = cache.get(key);
    if (cached) setTreasuries(cached);
    void discover(Boolean(cached?.length));
  }, [key, owner, requestedTreasury]);

  useEffect(() => {
    if (!owner) return;
    const id = window.setInterval(() => void discover(true), 30_000);
    return () => window.clearInterval(id);
  }, [discover, owner]);

  return { treasuries, loading, refreshing, error, refreshedAt, refresh: () => discover(true), provider };
}
