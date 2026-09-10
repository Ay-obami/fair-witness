import { Link, useLocation, useNavigate } from "react-router-dom";
import { useState, type ReactNode } from "react";
import { useAuthSession } from "../lib/authSession";

const NAV_ITEMS = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/activity", label: "Activity" },
  { to: "/safeguards", label: "Safeguards" },
  { to: "/evidence", label: "Evidence" },
];

const PRODUCT_LINKS = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/activity", label: "Agent activity" },
  { to: "/safeguards", label: "Safeguards" },
  { to: "/evidence", label: "Verified evidence" },
];

const TECH_LINKS = [
  { to: "/architecture", label: "Architecture" },
  { to: "/docs", label: "Technical docs" },
];

const short = (value: string) => `${value.slice(0, 6)}…${value.slice(-4)}`;

export function Layout({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { account, resolving, logout } = useAuthSession();
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await logout();
      navigate("/");
    } finally {
      setLoggingOut(false);
    }
  }

  return <div className="flex min-h-screen flex-col bg-background">
    <nav className="shrink-0 border-b border-hairline">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-4 py-3 sm:flex-row sm:justify-between sm:px-6">
        <Link to="/" aria-label="Fair Witness home" className="flex shrink-0 items-center">
          <img src="/fair-witness-logo.svg" alt="Fair Witness" className="h-10 w-auto sm:h-11" />
        </Link>
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-3 text-sm sm:gap-x-4">
          {NAV_ITEMS.map(({to,label}) => {
            const active = location.pathname === to || (to === "/dashboard" && location.pathname.startsWith("/dashboard/"));
            return <Link key={to} to={to} aria-current={active ? "page" : undefined} className={`relative rounded-md px-3 py-1.5 transition ${active ? "bg-ledger-800 text-ledger-100" : "text-text-secondary hover:bg-ledger-900 hover:text-text-primary"}`}>
              {label}
              {active && <span className="absolute inset-x-3 -bottom-[17px] h-0.5 rounded bg-copper-400" />}
            </Link>;
          })}

          {!resolving && account ? <>
            <span className="hidden rounded-md border border-ledger-700 px-3 py-1.5 font-data text-xs text-ledger-400 lg:inline">{short(account.address)}</span>
            <button type="button" disabled={loggingOut} onClick={()=>void handleLogout()} className="rounded-md border border-ledger-700 px-3 py-1.5 text-xs text-ledger-300 transition hover:border-alert-500/50 hover:text-alert-400 disabled:opacity-50">{loggingOut ? "Signing out…" : "Log out"}</button>
          </> : !resolving ? <Link to="/signup" className="rounded-md border border-ledger-700 px-3 py-1.5 text-xs text-ledger-300 transition hover:border-copper-500 hover:text-ledger-100">Sign in</Link> : null}

          <Link to="/signup?intent=new" className={`rounded-md px-4 py-1.5 text-xs font-semibold transition ${location.pathname === "/mandate" ? "bg-copper-400 text-ledger-950 ring-2 ring-copper-400/20" : "bg-copper-500 text-ledger-950 hover:bg-copper-400"}`}>New treasury</Link>
        </div>
      </div>
    </nav>

    <div className="flex-1">{children}</div>

    <footer className="shrink-0 border-t border-ledger-800 bg-ledger-950/80">
      <div className="mx-auto max-w-6xl px-6 py-10 md:py-12">
        <div className="grid gap-10 md:grid-cols-[1.4fr_.8fr_.8fr]">
          <section>
            <Link to="/" aria-label="Fair Witness home" className="inline-flex">
              <img src="/fair-witness-logo.svg" alt="Fair Witness" className="h-12 w-auto" />
            </Link>
            <p className="mt-4 max-w-md text-sm leading-relaxed text-ledger-400">Trust-minimized execution for autonomous financial agents on Creditcoin. AI proposes. Deterministic policy authorizes. Treasury executes.</p>
            <div className="mt-5 flex flex-wrap gap-2 text-xs text-ledger-500">
              <span className="rounded-full border border-ledger-800 px-3 py-1">Non-custodial</span>
              <span className="rounded-full border border-ledger-800 px-3 py-1">Attestcoin verified</span>
              <span className="rounded-full border border-ledger-800 px-3 py-1">On-chain policy</span>
            </div>
          </section>

          <section>
            <p className="text-xs font-semibold uppercase tracking-widest text-ledger-300">Product</p>
            <div className="mt-4 flex flex-col gap-3 text-sm text-ledger-500">
              {PRODUCT_LINKS.map(item => <Link key={item.to} to={item.to} className="transition hover:text-ledger-200">{item.label}</Link>)}
            </div>
          </section>

          <section>
            <p className="text-xs font-semibold uppercase tracking-widest text-ledger-300">Protocol</p>
            <div className="mt-4 flex flex-col gap-3 text-sm text-ledger-500">
              {TECH_LINKS.map(item => <Link key={item.to} to={item.to} className="transition hover:text-ledger-200">{item.label}</Link>)}
              <a href="https://creditcoin-testnet.blockscout.com/address/0x52C36499AA400F74432Eb327Cd1fB51Be573AeEd" target="_blank" rel="noreferrer" className="transition hover:text-ledger-200">Factory contract ↗</a>
            </div>
          </section>
        </div>

        <div className="mt-10 flex flex-col gap-3 border-t border-ledger-800 pt-6 text-xs text-ledger-600 sm:flex-row sm:items-center sm:justify-between">
          <p>Fair Witness · Creditcoin CC3 public testnet</p>
          <p>Controlled demo markets. Verification and policy execution are real on-chain.</p>
        </div>
      </div>
    </footer>
  </div>;
}
