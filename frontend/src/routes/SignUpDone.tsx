import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Layout } from "../components/layout";
import { ethers } from "ethers";
import { ethers6Adapter } from "thirdweb/adapters/ethers6";
import { creditcoinTestnet, wallet, thirdwebClient } from "../lib/thirdweb";
import { config } from "../lib/config";
import { FAIR_WITNESS_TREASURY_ABI } from "../lib/abi";
import { CONTROLLED_DEMO } from "../lib/controlledDemo";

function useQuery() { return new URLSearchParams(useLocation().search); }

export default function SignUpDone() {
  const navigate = useNavigate();
  const address = useQuery().get("address");
  const [account, setAccount] = useState(() => wallet.getAccount());
  const [owner, setOwner] = useState("");
  const [policyHash, setPolicyHash] = useState("");
  const [registered, setRegistered] = useState(false);
  const [mode, setMode] = useState(0);
  const [busy, setBusy] = useState<"register"|"activate"|null>(null);
  const [error, setError] = useState<string|null>(null);
  const provider = useMemo(()=>new ethers.JsonRpcProvider(config.creditcoinRpcUrl || "https://rpc.cc3-testnet.creditcoin.network"),[ ]);

  useEffect(()=>{ if (!address) navigate("/signup"); },[address,navigate]);
  useEffect(()=>{ wallet.autoConnect({client:thirdwebClient}).then(()=>setAccount(wallet.getAccount())).catch(()=>{}); },[]);

  async function refresh() {
    if (!address) return;
    const treasury = new ethers.Contract(ethers.getAddress(address), FAIR_WITNESS_TREASURY_ABI, provider);
    const agent = config.agentSubmitAddress || CONTROLLED_DEMO.agent;
    const [o,h,r,m] = await Promise.all([treasury.owner(),treasury.currentPolicyHash(),treasury.registeredAgents(agent),treasury.automationMode()]);
    setOwner(o); setPolicyHash(h); setRegistered(Boolean(r)); setMode(Number(m));
  }
  useEffect(()=>{ void refresh().catch(e=>setError(e instanceof Error?e.message:String(e))); },[address]);

  async function write(action:"register"|"activate") {
    if (!address || !account) return setError("Reconnect through Launch Fair Witness to perform owner actions.");
    setBusy(action); setError(null);
    try {
      if (owner && account.address.toLowerCase() !== owner.toLowerCase()) throw new Error("Connected wallet is not this treasury's owner.");
      const signer = await ethers6Adapter.signer.toEthers({client:thirdwebClient,chain:creditcoinTestnet,account});
      const treasury = new ethers.Contract(ethers.getAddress(address), FAIR_WITNESS_TREASURY_ABI, signer);
      const tx = action === "register"
        ? await treasury.registerAgent(config.agentSubmitAddress || CONTROLLED_DEMO.agent)
        : await treasury.setAutomationMode(1);
      await tx.wait(); await refresh();
    } catch (e) { setError(e instanceof Error?e.message:String(e)); }
    finally { setBusy(null); }
  }

  if (!address) return null;
  const treasuryAddress = ethers.getAddress(address);
  return <Layout><main className="mx-auto max-w-3xl px-6 py-14">
    <p className="text-xs uppercase tracking-widest text-verified-400">Treasury deployed</p>
    <h1 className="mt-2 text-3xl font-semibold text-ledger-100">Activate your Fair Witness</h1>
    <p className="mt-3 text-sm text-ledger-400">The treasury starts paused. Complete the owner-controlled steps below before autonomous proposals can execute.</p>
    <section className="mt-7 rounded-lg border border-ledger-700 bg-ledger-900 p-5">
      <p className="text-xs uppercase text-ledger-500">Treasury</p><code className="mt-2 block break-all text-sm text-verified-400">{treasuryAddress}</code>
      <p className="mt-3 text-xs text-ledger-400">Owner <span className="font-data break-all text-ledger-200">{owner || "Loading…"}</span></p>
      <p className="mt-2 text-xs text-ledger-400">Policy hash <span className="font-data break-all text-ledger-200">{policyHash || "Loading…"}</span></p>
      <a className="mt-3 inline-block text-xs text-copper-400" href={`${config.explorerBaseUrl}/address/${treasuryAddress}`} target="_blank" rel="noreferrer">View on explorer ↗</a>
    </section>

    <Step n="1" title="Authorize the bounded agent" done={registered} text="Only the owner can allowlist the Fair Witness submitter. Registration does not give the agent custody; schema-v1 policy still validates every proposal.">
      {!registered && <button disabled={busy!==null} onClick={()=>void write("register")} className="mt-4 rounded bg-copper-500 px-4 py-2 text-sm font-semibold text-ledger-950 disabled:opacity-50">{busy==="register"?"Registering…":"Authorize Fair Witness agent"}</button>}
    </Step>
    <Step n="2" title="Fund the test treasury" done={false} text="Send controlled fwWCTC and/or fwUSD directly to this treasury. These fixed-supply demonstration tokens have no economic value; the agent never receives them.">
      <div className="mt-3 space-y-1 font-data text-xs text-ledger-300"><p>fwWCTC: {CONTROLLED_DEMO.destination.wctc}</p><p>fwUSD: {CONTROLLED_DEMO.destination.stable}</p></div>
      <p className="mt-3 text-xs text-alert-400">Automatic faucet funding is intentionally not faked in the UI. A dedicated rate-limited faucet deployment is the remaining operational step.</p>
    </Step>
    <Step n="3" title="Enable autonomous mode" done={mode===1} text="This owner transaction advances the policy epoch/hash and allows registered agents to submit proposals. You can pause again at any time.">
      {mode!==1 && <button disabled={busy!==null || !registered} onClick={()=>void write("activate")} className="mt-4 rounded bg-verified-500 px-4 py-2 text-sm font-semibold text-ledger-950 disabled:opacity-50">{busy==="activate"?"Activating…":"Enable autonomous mode"}</button>}
    </Step>
    {error && <p className="mt-5 rounded border border-alert-500/30 bg-alert-500/5 p-3 text-sm text-alert-400">{error}</p>}
    <div className="mt-7 flex gap-4"><Link to={`/dashboard?treasury=${treasuryAddress}`} className="rounded border border-copper-500 px-4 py-2 text-sm text-copper-300">Open dashboard</Link><Link to="/evidence" className="px-4 py-2 text-sm text-ledger-400">Protocol evidence</Link></div>
  </main></Layout>;
}

function Step({n,title,text,done,children}:{n:string;title:string;text:string;done:boolean;children:React.ReactNode}) { return <section className="mt-5 rounded-lg border border-ledger-700 bg-ledger-900 p-5"><div className="flex items-center justify-between"><h2 className="text-lg text-ledger-100">{n}. {title}</h2><span className={done?"text-xs text-verified-400":"text-xs text-ledger-500"}>{done?"DONE ✓":"PENDING"}</span></div><p className="mt-2 text-sm leading-relaxed text-ledger-400">{text}</p>{children}</section>; }
