import { useEffect, useMemo, useState } from "react";
import { Layout } from "../components/layout";
import { Link } from "react-router-dom";
import { ethers } from "ethers";
import { getUserEmail, preAuthenticate } from "thirdweb/wallets/in-app";
import { ethers6Adapter } from "thirdweb/adapters/ethers6";
import { creditcoinTestnet, wallet, client, thirdwebConfigured } from "../lib/thirdweb";
import { config } from "../lib/config";
import { FAIR_WITNESS_FACTORY_ABI, FAIR_WITNESS_TREASURY_ABI } from "../lib/abi";
import { fetchInstancesForWallet } from "../lib/instanceStore";

interface TreasuryView {
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
  rebalance: any;
  risk: any;
}

export default function Dashboard() {
  const provider = useMemo(()=>new ethers.JsonRpcProvider(config.creditcoinRpcUrl),[]);
  const factory = useMemo(()=>new ethers.Contract(config.factoryAddress, FAIR_WITNESS_FACTORY_ABI, provider),[provider]);
  const [account,setAccount] = useState(()=>wallet.getAccount());
  const [email,setEmail] = useState("");
  const [otp,setOtp] = useState("");
  const [awaitingOtp,setAwaitingOtp] = useState(false);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState<string|null>(null);
  const [treasuries,setTreasuries] = useState<TreasuryView[]>([]);
  const [loading,setLoading] = useState(false);
  const [signedEmail,setSignedEmail] = useState<string|undefined>();

  useEffect(()=>{ if (!thirdwebConfigured) return; wallet.autoConnect({client}).then(a=>{if(a)setAccount(a)}).catch(()=>{}); },[]);

  async function readTreasury(address:string):Promise<TreasuryView> {
    const c = new ethers.Contract(address, FAIR_WITNESS_TREASURY_ABI, provider);
    const [owner,mode,hash,epoch,registered,wctc,stable,u,risk,rebalance] = await Promise.all([
      c.owner(),c.automationMode(),c.currentPolicyHash(),c.policyEpoch(),c.registeredAgents(config.agentSubmitAddress),c.WCTC(),c.STABLE(),c.universalPolicy(),c.riskPolicy(),c.rebalancePolicy(),
    ]);
    const tokenAbi=["function balanceOf(address) view returns(uint256)"];
    const [wctcBalance,stableBalance]=await Promise.all([
      new ethers.Contract(wctc,tokenAbi,provider).balanceOf(address),new ethers.Contract(stable,tokenAbi,provider).balanceOf(address),
    ]);
    return {address:ethers.getAddress(address),owner,automationMode:Number(mode),policyHash:hash,policyEpoch:BigInt(epoch),registered:Boolean(registered),wctc,stable,wctcBalance:BigInt(wctcBalance),stableBalance:BigInt(stableBalance),universal:u,risk,rebalance};
  }

  async function discover(owner:string) {
    setLoading(true); setError(null);
    try {
      const latest = await provider.getBlockNumber();
      const fromBlock = Number(import.meta.env.VITE_FACTORY_DEPLOYMENT_BLOCK ?? Math.max(0,latest-500_000));
      const filter = factory.filters.TreasuryCreated(null,owner,null);
      let events: ethers.Log[] = [];
      try { events = await factory.queryFilter(filter,fromBlock,latest); } catch { events = []; }
      const addresses = new Set<string>();
      for (const e of events) if (e instanceof ethers.EventLog) addresses.add(ethers.getAddress(e.args.treasury));
      const cached = await fetchInstancesForWallet(owner);
      for (const row of cached ?? []) addresses.add(ethers.getAddress(row.instanceAddress));
      const views = (await Promise.all([...addresses].map(async a=>{try{return await readTreasury(a)}catch{return null}}))).filter((v):v is TreasuryView=>v!==null && v.owner.toLowerCase()===owner.toLowerCase());
      setTreasuries(views);
      try { setSignedEmail(await getUserEmail({client})); } catch { /* optional */ }
    } catch(e){ setError(e instanceof Error?e.message:String(e)); }
    finally{setLoading(false)}
  }
  useEffect(()=>{ if(account) void discover(account.address); },[account]);

  async function sendCode(e:React.FormEvent){e.preventDefault();if(!thirdwebConfigured)return setError("VITE_THIRDWEB_CLIENT_ID is not configured.");setBusy(true);setError(null);try{await preAuthenticate({client,strategy:"email",email});setAwaitingOtp(true)}catch(e){setError(e instanceof Error?e.message:String(e))}finally{setBusy(false)}}
  async function verify(e:React.FormEvent){e.preventDefault();setBusy(true);setError(null);try{const a=await wallet.connect({client,chain:creditcoinTestnet,strategy:"email",email,verificationCode:otp});setAccount(a);setAwaitingOtp(false)}catch(e){setError(e instanceof Error?e.message:String(e))}finally{setBusy(false)}}

  async function setAutomation(view:TreasuryView,next:number){
    if(!account)return;
    setBusy(true);setError(null);
    try{
      const signer=await ethers6Adapter.signer.toEthers({client,chain:creditcoinTestnet,account});
      const c=new ethers.Contract(view.address,FAIR_WITNESS_TREASURY_ABI,signer);
      await (await c.setAutomationMode(next)).wait();
      await discover(account.address);
    }catch(e){setError(e instanceof Error?e.message:String(e))}finally{setBusy(false)}
  }

  return <Layout><main className="mx-auto max-w-5xl px-6 py-12">
    <p className="text-xs uppercase tracking-widest text-copper-400">Owner console</p><h1 className="mt-2 text-3xl font-semibold text-ledger-100">Your Fair Witness treasuries</h1>
    <p className="mt-3 max-w-3xl text-sm leading-relaxed text-ledger-400">Factory events and on-chain ownership are authoritative. Supabase is used only as an optional discovery cache.</p>
    {!account && <section className="mt-8 rounded-lg border border-ledger-700 bg-ledger-900 p-6">
      <h2 className="text-lg text-ledger-100">Sign in to your embedded wallet</h2>
      {!thirdwebConfigured && <p className="mt-3 text-sm text-alert-400">This deployment is missing VITE_THIRDWEB_CLIENT_ID.</p>}
      {!awaitingOtp?<form onSubmit={sendCode} className="mt-4 flex gap-3"><input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com" className="flex-1 rounded border border-ledger-700 bg-ledger-950 px-3 py-2 text-ledger-100"/><button disabled={busy||!thirdwebConfigured} className="rounded bg-copper-500 px-4 py-2 text-sm font-semibold text-ledger-950 disabled:opacity-50">{busy?"Sending…":"Send code"}</button></form>:<form onSubmit={verify} className="mt-4 flex gap-3"><input value={otp} onChange={e=>setOtp(e.target.value)} placeholder="Verification code" className="flex-1 rounded border border-ledger-700 bg-ledger-950 px-3 py-2 text-ledger-100"/><button disabled={busy} className="rounded bg-copper-500 px-4 py-2 text-sm font-semibold text-ledger-950">Verify</button></form>}
    </section>}
    {account && <>
      <section className="mt-7 rounded-lg border border-ledger-700 bg-ledger-900 p-5"><p className="text-xs uppercase text-ledger-500">Signed in</p><p className="mt-1 text-sm text-verified-400">{signedEmail??"embedded wallet"}</p><code className="mt-1 block break-all text-xs text-ledger-400">{account.address}</code></section>
      {loading && <p className="mt-6 text-sm text-ledger-400">Discovering factory treasuries…</p>}
      {!loading && treasuries.length===0 && <section className="mt-6 rounded-lg border border-ledger-700 bg-ledger-900 p-6"><p className="text-sm text-ledger-300">No schema-v1 treasury found for this wallet in the indexed factory range.</p><Link to="/mandate" className="mt-4 inline-block text-sm text-copper-400">Create your first treasury →</Link></section>}
      <div className="mt-7 space-y-5">{treasuries.map(view=><TreasuryCard key={view.address} view={view} busy={busy} onMode={setAutomation}/>)}</div>
    </>}
    {error&&<p className="mt-5 rounded border border-alert-500/30 bg-alert-500/5 p-3 text-sm text-alert-400">{error}</p>}
  </main></Layout>;
}

function TreasuryCard({view,busy,onMode}:{view:TreasuryView;busy:boolean;onMode:(view:TreasuryView,next:number)=>Promise<void>}){
  const enabled=Number(view.universal.enabledStrategies);
  return <article className="rounded-lg border border-ledger-700 bg-ledger-900 p-6">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs uppercase text-ledger-500">Treasury</p><code className="mt-1 block break-all text-sm text-verified-400">{view.address}</code></div><span className={view.automationMode===1?"text-xs text-verified-400":"text-xs text-alert-400"}>{view.automationMode===1?"AUTONOMOUS ●":"PAUSED"}</span></div>
    <div className="mt-5 grid gap-3 text-xs sm:grid-cols-2 lg:grid-cols-4"><Metric k="Agent" v={view.registered?"AUTHORIZED":"NOT AUTHORIZED"}/><Metric k="Policy epoch" v={view.policyEpoch.toString()}/><Metric k="fwWCTC" v={ethers.formatUnits(view.wctcBalance,18)}/><Metric k="fwUSD" v={ethers.formatUnits(view.stableBalance,6)}/></div>
    <div className="mt-4 grid gap-3 text-xs sm:grid-cols-3"><Metric k="Strategies" v={`${enabled&4?"Risk ":""}${enabled&2?"Rebalance ":""}${enabled&1?"Arbitrage":""}`.trim()||"None"}/><Metric k="Target WCTC" v={`${Number(view.rebalance.targetWctcBps)/100}%`}/><Metric k="Risk ceiling" v={`${Number(view.risk.maxWctcExposureBps)/100}%`}/></div>
    <p className="font-data mt-4 break-all text-[11px] text-ledger-500">Policy {view.policyHash}</p>
    <div className="mt-5 flex flex-wrap gap-3"><button disabled={busy} onClick={()=>void onMode(view,view.automationMode===1?0:1)} className="rounded border border-copper-500 px-4 py-2 text-sm text-copper-300 disabled:opacity-50">{view.automationMode===1?"Pause agent":"Enable autonomy"}</button><Link to={`/signup/done?address=${view.address}`} className="rounded border border-ledger-600 px-4 py-2 text-sm text-ledger-300">Activation & agent</Link><a href={`${config.explorerBaseUrl}/address/${view.address}`} target="_blank" rel="noreferrer" className="px-4 py-2 text-sm text-ledger-400">Explorer ↗</a></div>
  </article>
}
function Metric({k,v}:{k:string;v:string}){return <div className="rounded border border-ledger-800 bg-ledger-950 p-3"><p className="text-ledger-500">{k}</p><p className="mt-1 break-all text-ledger-200">{v}</p></div>}
