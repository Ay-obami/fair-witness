import { useEffect, useMemo, useState } from "react";
import { Layout } from "../components/layout";
import { Link, useSearchParams } from "react-router-dom";
import { ethers } from "ethers";
import { getUserEmail, preAuthenticate } from "thirdweb/wallets/in-app";
import { ethers6Adapter } from "thirdweb/adapters/ethers6";
import { creditcoinTestnet, wallet, client, thirdwebConfigured } from "../lib/thirdweb";
import { config } from "../lib/config";
import { FAIR_WITNESS_FACTORY_ABI, FAIR_WITNESS_TREASURY_ABI } from "../lib/abi";
import { fetchInstancesForWallet } from "../lib/instanceStore";
import { humanError } from "../lib/humanError";
import { reasonLabel } from "../lib/policyUi";

interface ActivityItem { blockNumber:number; txHash:string; attemptId:string; result:number; reason:number; }
interface TreasuryView {
  address:string; owner:string; automationMode:number; policyHash:string; policyEpoch:bigint; registered:boolean;
  wctc:string; stable:string; wctcBalance:bigint; stableBalance:bigint; universal:any; arbitrage:any; rebalance:any; risk:any;
  createdBlock?:number; createdAt?:number; activities:ActivityItem[];
}
const DEFAULT_FACTORY_DEPLOYMENT_BLOCK=5_456_821; const LOG_CHUNK_SIZE=25_000;
const pct=(bps:unknown)=>`${Number(bps)/100}%`;
const short=(v:string)=>`${v.slice(0,6)}…${v.slice(-4)}`;
const strategyBadges=(mask:number)=>[{bit:4,label:"Risk Reduction"},{bit:2,label:"Rebalancing"},{bit:1,label:"Arbitrage"}].filter(x=>mask&x.bit);

export default function Dashboard(){
  const [params]=useSearchParams(); const requestedTreasury=params.get("treasury");
  const provider=useMemo(()=>new ethers.JsonRpcProvider(config.creditcoinRpcUrl),[]);
  const factory=useMemo(()=>new ethers.Contract(config.factoryAddress,FAIR_WITNESS_FACTORY_ABI,provider),[provider]);
  const [account,setAccount]=useState(()=>wallet.getAccount()); const [email,setEmail]=useState(""); const [otp,setOtp]=useState("");
  const [awaitingOtp,setAwaitingOtp]=useState(false); const [busy,setBusy]=useState(false); const [error,setError]=useState<string|null>(null);
  const [treasuries,setTreasuries]=useState<TreasuryView[]>([]); const [loading,setLoading]=useState(false); const [signedEmail,setSignedEmail]=useState<string|undefined>(); const [refreshedAt,setRefreshedAt]=useState<Date|null>(null);
  useEffect(()=>{if(!thirdwebConfigured)return;wallet.autoConnect({client}).then(a=>{if(a)setAccount(a)}).catch(()=>{})},[]);

  async function readActivities(c:ethers.Contract):Promise<ActivityItem[]>{
    const latest=await provider.getBlockNumber(); const from=Math.max(DEFAULT_FACTORY_DEPLOYMENT_BLOCK,latest-150_000);
    try{const events=await c.queryFilter(c.filters.AttemptResolved(),from,latest);return events.slice(-8).reverse().map((e:any)=>({blockNumber:e.blockNumber,txHash:e.transactionHash,attemptId:String(e.args.attemptId),result:Number(e.args.result),reason:Number(e.args.reason)}));}catch{return []}
  }
  async function readTreasury(address:string,createdBlock?:number):Promise<TreasuryView>{
    const normalized=ethers.getAddress(address); const c=new ethers.Contract(normalized,FAIR_WITNESS_TREASURY_ABI,provider);
    const [owner,mode,hash,epoch,registered,wctc,stable,u,a,risk,rebalance,activities]=await Promise.all([c.owner(),c.automationMode(),c.currentPolicyHash(),c.policyEpoch(),c.registeredAgents(config.agentSubmitAddress),c.WCTC(),c.STABLE(),c.universalPolicy(),c.arbitragePolicy(),c.riskPolicy(),c.rebalancePolicy(),readActivities(c)]);
    const tokenAbi=["function balanceOf(address) view returns(uint256)"]; const [wctcBalance,stableBalance]=await Promise.all([new ethers.Contract(wctc,tokenAbi,provider).balanceOf(normalized),new ethers.Contract(stable,tokenAbi,provider).balanceOf(normalized)]);
    let createdAt:number|undefined; if(createdBlock){try{createdAt=(await provider.getBlock(createdBlock))?.timestamp}catch{}}
    return {address:normalized,owner,automationMode:Number(mode),policyHash:hash,policyEpoch:BigInt(epoch),registered:Boolean(registered),wctc,stable,wctcBalance:BigInt(wctcBalance),stableBalance:BigInt(stableBalance),universal:u,arbitrage:a,risk,rebalance,activities,createdBlock,createdAt};
  }
  async function discover(owner:string){
    setLoading(true);setError(null);try{
      const found=new Map<string,number|undefined>(); if(requestedTreasury&&ethers.isAddress(requestedTreasury)){const a=ethers.getAddress(requestedTreasury);try{if(await factory.isFactoryTreasury(a))found.set(a,undefined)}catch{}}
      const latest=await provider.getBlockNumber(); const raw=import.meta.env.VITE_FACTORY_DEPLOYMENT_BLOCK?.trim(); const first=Math.min(raw?Number(raw):DEFAULT_FACTORY_DEPLOYMENT_BLOCK,latest); const filter=factory.filters.TreasuryCreated(null,owner,null);
      for(let from=first;from<=latest;from+=LOG_CHUNK_SIZE){try{const events=await factory.queryFilter(filter,from,Math.min(latest,from+LOG_CHUNK_SIZE-1));for(const e of events)if(e instanceof ethers.EventLog)found.set(ethers.getAddress(e.args.treasury),e.blockNumber)}catch(e){console.warn("factory log chunk failed",e)}}
      try{for(const row of await fetchInstancesForWallet(owner)??[])if(ethers.isAddress(row.instanceAddress)&&!found.has(ethers.getAddress(row.instanceAddress)))found.set(ethers.getAddress(row.instanceAddress),undefined)}catch{}
      const views=(await Promise.all([...found].map(async([a,b])=>{try{return await readTreasury(a,b)}catch{return null}}))).filter((v):v is TreasuryView=>!!v&&v.owner.toLowerCase()===owner.toLowerCase()).sort((a,b)=>(b.createdBlock??0)-(a.createdBlock??0));
      setTreasuries(views); setRefreshedAt(new Date()); try{setSignedEmail(await getUserEmail({client}))}catch{}
    }catch(e){setError(humanError(e,"Treasury discovery failed. Please retry."))}finally{setLoading(false)}
  }
  useEffect(()=>{if(account)void discover(account.address)},[account,requestedTreasury]);
  useEffect(()=>{if(!account)return;const id=setInterval(()=>void discover(account.address),30000);return()=>clearInterval(id)},[account,requestedTreasury]);
  async function sendCode(e:React.FormEvent){e.preventDefault();if(!thirdwebConfigured)return setError("VITE_THIRDWEB_CLIENT_ID is not configured.");setBusy(true);try{await preAuthenticate({client,strategy:"email",email});setAwaitingOtp(true)}catch(e){setError(humanError(e))}finally{setBusy(false)}}
  async function verify(e:React.FormEvent){e.preventDefault();setBusy(true);try{const a=await wallet.connect({client,chain:creditcoinTestnet,strategy:"email",email,verificationCode:otp});setAccount(a);setAwaitingOtp(false)}catch(e){setError(humanError(e))}finally{setBusy(false)}}
  async function setAutomation(view:TreasuryView,next:number){if(!account)return;if(view.automationMode===1&&next===0&&!confirm("Pause autonomous execution? The agent will stop executing new proposals until you enable it again."))return;setBusy(true);try{const signer=await ethers6Adapter.signer.toEthers({client,chain:creditcoinTestnet,account});await (await new ethers.Contract(view.address,FAIR_WITNESS_TREASURY_ABI,signer).setAutomationMode(next)).wait();await discover(account.address)}catch(e){setError(humanError(e))}finally{setBusy(false)}}

  return <Layout><main className="mx-auto max-w-6xl px-6 py-10">
    <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs uppercase tracking-widest text-copper-400">Owner console</p><h1 className="mt-2 text-3xl font-semibold text-ledger-100">Your Fair Witness</h1><p className="mt-2 text-sm text-ledger-400">See what your agents are doing, why they acted, and the limits they cannot cross.</p></div>{refreshedAt&&<p className="text-xs text-ledger-500">Live on-chain data · updated {refreshedAt.toLocaleTimeString()}</p>}</div>
    {!account&&<section className="mt-8 rounded-xl border border-ledger-700 bg-ledger-900 p-6"><h2 className="text-lg text-ledger-100">Sign in</h2>{!awaitingOtp?<form onSubmit={sendCode} className="mt-4 flex gap-3"><input type="email" value={email} onChange={e=>setEmail(e.target.value)} className="flex-1 rounded border border-ledger-700 bg-ledger-950 px-3 py-2"/><button className="rounded bg-copper-500 px-4 py-2 text-ledger-950">Send code</button></form>:<form onSubmit={verify} className="mt-4 flex gap-3"><input value={otp} onChange={e=>setOtp(e.target.value)} className="flex-1 rounded border border-ledger-700 bg-ledger-950 px-3 py-2"/><button className="rounded bg-copper-500 px-4 py-2 text-ledger-950">Verify</button></form>}</section>}
    {account&&<><div className="mt-6 flex items-center gap-3 text-xs text-ledger-500"><span className="rounded-full border border-ledger-700 px-3 py-1">{signedEmail??"Embedded wallet"}</span><span className="font-data">{short(account.address)}</span></div>{loading&&<p className="mt-8 text-sm text-ledger-400">Refreshing on-chain state…</p>}{!loading&&treasuries.length===0&&<section className="mt-8 rounded-xl border border-ledger-700 bg-ledger-900 p-6"><p className="text-ledger-300">No treasury found for this wallet.</p><Link to="/signup" className="mt-4 inline-block text-copper-400">Create your first treasury →</Link></section>}<div className="mt-8 space-y-8">{treasuries.map((v,i)=><TreasuryCard key={v.address} view={v} index={treasuries.length-i} busy={busy} onMode={setAutomation}/>)}</div></>}
    {error&&<p className="mt-5 rounded border border-alert-500/30 bg-alert-500/5 p-3 text-sm text-alert-400">{error}</p>}
  </main></Layout>
}

function TreasuryCard({view,index,busy,onMode}:{view:TreasuryView;index:number;busy:boolean;onMode:(v:TreasuryView,n:number)=>Promise<void>}){
  const active=view.automationMode===1&&view.registered; const wctc=Number(ethers.formatUnits(view.wctcBalance,18)); const usd=Number(ethers.formatUnits(view.stableBalance,6)); const total=wctc+usd; const alloc=total?Math.round(wctc/total*100):0; const target=Number(view.rebalance.targetWctcBps)/100; const tol=Number(view.rebalance.toleranceBps)/100; const latest=view.activities[0]; const lastText=!latest?"No proposals yet":latest.result===1?"Executed":latest.result===2?"Execution failed":"Rejected";
  return <article className="overflow-hidden rounded-2xl border border-ledger-700 bg-ledger-900">
    <section className="border-b border-ledger-800 p-6"><div className="flex flex-wrap items-start justify-between gap-5"><div><p className="text-xs uppercase tracking-wider text-ledger-500">Treasury #{index}{index===1?" · latest":""}</p><h2 className="mt-2 text-xl font-semibold text-ledger-100">{active?"Agent Active":"Agent Paused"}</h2><p className="mt-1 text-sm text-ledger-400">{active?"Operating within your mandate":"No autonomous proposals can execute"}</p></div><div className={`rounded-full border px-3 py-1 text-xs ${active?"border-verified-500/40 text-verified-400":"border-alert-500/40 text-alert-400"}`}>● {active?"ACTIVE":"PAUSED"}</div></div>
      <div className="mt-6 grid gap-4 md:grid-cols-3"><div className="rounded-xl border border-ledger-800 bg-ledger-950 p-4"><p className="text-xs text-ledger-500">Portfolio</p><p className="mt-1 text-2xl font-semibold text-ledger-100">{total.toFixed(2)} demo units</p><p className="mt-2 text-xs text-ledger-400">{wctc.toFixed(2)} fwWCTC · {usd.toFixed(2)} fwUSD</p></div><div className="rounded-xl border border-ledger-800 bg-ledger-950 p-4"><p className="text-xs text-ledger-500">WCTC allocation</p><p className="mt-1 text-2xl font-semibold text-ledger-100">{alloc}%</p><div className="mt-3 h-2 overflow-hidden rounded bg-ledger-800"><div className="h-full bg-verified-500" style={{width:`${Math.min(100,alloc)}%`}}/></div><p className="mt-2 text-xs text-ledger-400">Target {target}% · band {target-tol}%–{target+tol}%</p></div><div className="rounded-xl border border-ledger-800 bg-ledger-950 p-4"><p className="text-xs text-ledger-500">Last on-chain decision</p><p className="mt-1 text-lg font-semibold text-ledger-100">{lastText}</p><p className="mt-2 text-xs text-ledger-400">{latest?reasonLabel(latest.reason):"Agent is ready and waiting for a policy-bounded candidate."}</p></div></div>
      <div className="mt-5 flex flex-wrap gap-3"><button disabled={busy} onClick={()=>void onMode(view,view.automationMode===1?0:1)} className="rounded bg-copper-500 px-4 py-2 text-sm font-semibold text-ledger-950 disabled:opacity-50">{view.automationMode===1?"Pause agent":"Enable agent"}</button><a href={`${config.explorerBaseUrl}/address/${view.address}`} target="_blank" rel="noreferrer" className="rounded border border-ledger-600 px-4 py-2 text-sm text-ledger-300">View on explorer ↗</a><Link to={`/signup/done?address=${view.address}`} className="px-4 py-2 text-sm text-ledger-400">Owner controls</Link></div>
    </section>
    <section id="safeguards" className="grid gap-6 p-6 lg:grid-cols-2"><div><h3 className="text-lg font-semibold text-ledger-100">Your safeguards</h3><div className="mt-4 grid grid-cols-2 gap-3 text-sm"><Guard k="Maximum action" v={`${ethers.formatUnits(view.universal.maxActionValueE6,6)} fwUSD`}/><Guard k="Maximum slippage" v={pct(view.universal.maxSlippageBps)}/><Guard k="WCTC target" v={pct(view.rebalance.targetWctcBps)}/><Guard k="Risk ceiling" v={pct(view.risk.maxWctcExposureBps)}/><Guard k="Arbitrage threshold" v={pct(view.arbitrage.minNetEdgeBps)}/><Guard k="Actions / epoch" v={String(view.universal.maxExecutionsPerEpoch)}/></div><div className="mt-4 space-y-1 text-xs text-verified-400"><p>✓ You own this treasury</p><p>✓ Agent cannot withdraw funds</p><p>✓ AI cannot change your mandate</p><p>✓ Every execution is checked on-chain</p></div><details className="mt-4 text-xs text-ledger-500"><summary className="cursor-pointer text-copper-400">Advanced on-chain details</summary><p className="mt-2 break-all">Treasury {view.address}</p><p className="mt-1 break-all">Policy {view.policyHash}</p><p className="mt-1">Policy epoch {view.policyEpoch.toString()}</p><div className="mt-2 flex flex-wrap gap-2">{strategyBadges(Number(view.universal.enabledStrategies)).map(s=><span key={s.label} className="rounded-full border border-ledger-700 px-2 py-1">{s.label}</span>)}</div></details></div>
      <div id="activity"><h3 className="text-lg font-semibold text-ledger-100">Agent activity</h3><p className="mt-1 text-xs text-ledger-500">Accepted and rejected attempts come directly from the on-chain journal.</p><div className="mt-4 space-y-3">{view.activities.length===0?<div className="rounded-lg border border-ledger-800 bg-ledger-950 p-4"><p className="text-sm text-ledger-300">No proposal attempts yet</p><p className="mt-1 text-xs text-ledger-500">The agent is observing and will act only when a deterministic strategy produces a valid candidate.</p></div>:view.activities.map(a=><div key={`${a.txHash}-${a.attemptId}`} className="rounded-lg border border-ledger-800 bg-ledger-950 p-4"><div className="flex justify-between gap-3"><p className={`text-sm font-semibold ${a.result===1?"text-verified-400":a.result===2?"text-alert-400":"text-copper-400"}`}>{a.result===1?"EXECUTED":a.result===2?"EXECUTION FAILED":"REJECTED"} · Attempt #{a.attemptId}</p><a href={`${config.explorerBaseUrl}/tx/${a.txHash}`} target="_blank" rel="noreferrer" className="text-xs text-ledger-500">Proof ↗</a></div><p className="mt-1 text-xs text-ledger-400">{reasonLabel(a.reason)}</p><p className="mt-1 text-[11px] text-ledger-600">Block {a.blockNumber}</p></div>)}</div></div>
    </section>
  </article>
}
function Guard({k,v}:{k:string;v:string}){return <div className="rounded-lg border border-ledger-800 bg-ledger-950 p-3"><p className="text-xs text-ledger-500">{k}</p><p className="mt-1 text-ledger-200">{v}</p></div>}
