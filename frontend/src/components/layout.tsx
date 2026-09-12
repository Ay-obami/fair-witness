import { Link, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useState, type ReactNode } from "react";
import { useAuthSession } from "../lib/authSession";
import { config } from "../lib/config";

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
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => { setMobileOpen(false); }, [location.pathname, location.search]);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await logout();
      navigate("/");
    } finally {
      setLoggingOut(false);
    }
  }

  const navLink = (to: string, label: string, mobile = false) => {
    const active = location.pathname === to || (to === "/dashboard" && location.pathname.startsWith("/dashboard/"));
    return <Link
      key={to}
      to={to}
      aria-current={active ? "page" : undefined}
      className={`${mobile ? "block w-full px-4 py-3" : "relative rounded-md px-3 py-1.5"} transition ${active ? "bg-ledger-800 text-ledger-100" : "text-text-secondary hover:bg-ledger-900 hover:text-text-primary"}`}
    >
      {label}
      {!mobile && active && <span className="absolute inset-x-3 -bottom-[17px] h-0.5 rounded bg-copper-400" />}
    </Link>;
  };

  return <div className="flex min-h-screen flex-col bg-background">
    <nav className="relative z-40 shrink-0 border-b border-hairline bg-background/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
        <Link to="/" aria-label="Fair Witness home" className="flex shrink-0 items-center">
          <img src="/fair-witness-logo.svg" alt="Fair Witness" className="h-9 w-auto sm:h-11" />
        </Link>

        <div className="hidden items-center gap-x-3 text-sm md:flex lg:gap-x-4">
          {NAV_ITEMS.map(({to,label}) => navLink(to, label))}
          {!resolving && account ? <>
            <span className="hidden rounded-md border border-ledger-700 px-3 py-1.5 font-data text-xs text-ledger-400 lg:inline">{short(account.address)}</span>
            <button type="button" disabled={loggingOut} onClick={()=>void handleLogout()} className="cursor-pointer rounded-md border border-ledger-700 px-3 py-1.5 text-xs text-ledger-300 transition hover:border-alert-500/50 hover:text-alert-400 disabled:cursor-not-allowed disabled:opacity-50">{loggingOut ? "Signing out…" : "Log out"}</button>
          </> : !resolving ? <Link to="/signup" className="rounded-md border border-ledger-700 px-3 py-1.5 text-xs text-ledger-300 transition hover:border-copper-500 hover:text-ledger-100">Sign in</Link> : null}
          <Link to="/signup?intent=new" className={`rounded-md px-4 py-1.5 text-xs font-semibold transition ${location.pathname === "/mandate" ? "bg-copper-400 text-ledger-950 ring-2 ring-copper-400/20" : "bg-copper-500 text-ledger-950 hover:bg-copper-400"}`}>New treasury</Link>
        </div>

        <button
          type="button"
          aria-label={mobileOpen ? "Close navigation" : "Open navigation"}
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen((open) => !open)}
          className="cursor-pointer rounded-lg border border-ledger-700 bg-ledger-900 p-2.5 text-ledger-200 transition hover:border-copper-500 md:hidden"
        >
          <span className="block h-0.5 w-5 bg-current" />
          <span className="mt-1.5 block h-0.5 w-5 bg-current" />
          <span className="mt-1.5 block h-0.5 w-5 bg-current" />
        </button>
      </div>

      {mobileOpen && <div className="absolute inset-x-0 top-full border-b border-ledger-800 bg-ledger-950 shadow-2xl md:hidden">
        <div className="mx-auto max-w-6xl px-4 py-4">
          <div className="overflow-hidden rounded-xl border border-ledger-800 bg-ledger-900/70">
            {NAV_ITEMS.map(({to,label}) => navLink(to, label, true))}
          </div>
          <div className="mt-4 grid gap-3">
            {!resolving && account ? <>
              <div className="flex items-center justify-between rounded-lg border border-ledger-800 px-4 py-3 text-xs text-ledger-400"><span>Connected wallet</span><span className="font-data">{short(account.address)}</span></div>
              <button type="button" disabled={loggingOut} onClick={()=>void handleLogout()} className="cursor-pointer rounded-lg border border-ledger-700 px-4 py-3 text-sm text-ledger-300 transition hover:border-alert-500/50 hover:text-alert-400 disabled:cursor-not-allowed disabled:opacity-50">{loggingOut ? "Signing out…" : "Log out"}</button>
            </> : !resolving ? <Link to="/signup" className="rounded-lg border border-ledger-700 px-4 py-3 text-center text-sm text-ledger-200">Sign in</Link> : null}
            <Link to="/signup?intent=new" className="rounded-lg bg-copper-500 px-4 py-3 text-center text-sm font-semibold text-ledger-950">New treasury</Link>
          </div>
        </div>
      </div>}
    </nav>

    <div className="flex-1">{children}</div>

    <footer className="shrink-0 border-t border-ledger-800 bg-ledger-950/80">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 md:py-12">
        <div className="grid gap-10 sm:grid-cols-2 md:grid-cols-[1.4fr_.8fr_.8fr]">
          <section className="sm:col-span-2 md:col-span-1">
            <Link to="/" aria-label="Fair Witness home" className="inline-flex">
              <img src="/fair-witness-logo.svg" alt="Fair Witness" className="h-11 w-auto sm:h-12" />
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
              <a href={`${config.explorerBaseUrl}/address/${config.factoryAddress}`} target="_blank" rel="noreferrer" className="transition hover:text-ledger-200">Factory contract ↗</a>
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
