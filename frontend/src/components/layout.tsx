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
  const newTreasuryPath = account ? "/mandate" : "/signup?intent=new";

  useEffect(() => { setMobileOpen(false); }, [location.pathname, location.search]);

  async function handleLogout() {
    setLoggingOut(true);
    try { await logout(); navigate("/"); }
    finally { setLoggingOut(false); }
  }

  const navLink = (to: string, label: string, mobile = false) => {
    const active = location.pathname === to || (to === "/dashboard" && location.pathname.startsWith("/dashboard/"));
    return <Link
      key={to}
      to={to}
      aria-current={active ? "page" : undefined}
      className={`${mobile ? "block w-full px-4 py-3" : "relative rounded-lg px-3 py-2"} transition ${active ? "bg-ledger-800/75 text-ledger-100" : "text-text-secondary hover:bg-ledger-900/70 hover:text-text-primary"}`}
    >
      {label}
      {!mobile && active && <span className="absolute inset-x-3 -bottom-[14px] h-0.5 rounded-full bg-gradient-to-r from-copper-400 to-verified-400 shadow-[0_0_12px_rgba(213,143,63,.35)]" />}
    </Link>;
  };

  return <div className="flex min-h-screen flex-col bg-background/40">
    <nav className="sticky top-0 z-40 shrink-0 border-b border-hairline bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/65">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
        <Link to="/" aria-label="Fair Witness home" className="group flex shrink-0 items-center gap-3">
          <img src="/fair-witness-logo.svg" alt="Fair Witness" className="h-9 w-auto transition group-hover:brightness-110 sm:h-11" />
          <span className="hidden items-center gap-2 rounded-full border border-ledger-800 bg-ledger-950/60 px-2.5 py-1 text-[9px] uppercase tracking-widest text-ledger-500 xl:inline-flex"><span className="h-1.5 w-1.5 rounded-full bg-verified-400 shadow-[0_0_10px_rgba(36,217,165,.55)]" /> CC3 live</span>
        </Link>

        <div className="hidden items-center gap-x-2 text-sm md:flex lg:gap-x-3">
          {NAV_ITEMS.map(({to,label}) => navLink(to, label))}
          {!resolving && account ? <>
            <span className="hidden rounded-lg border border-ledger-800 bg-ledger-950/50 px-3 py-2 font-data text-[10px] text-ledger-500 lg:inline">{short(account.address)}</span>
            <button type="button" disabled={loggingOut} onClick={()=>void handleLogout()} className="cursor-pointer rounded-lg border border-ledger-800 px-3 py-2 text-[11px] text-ledger-400 transition hover:border-alert-500/40 hover:bg-alert-500/5 hover:text-alert-400 disabled:cursor-not-allowed disabled:opacity-50">{loggingOut ? "Signing out…" : "Log out"}</button>
          </> : !resolving ? <Link to="/signup" className="fw-secondary-button rounded-lg px-3 py-2 text-[11px] text-ledger-300">Sign in</Link> : null}
          <Link to={newTreasuryPath} className="fw-primary-button rounded-lg px-4 py-2 text-[11px] font-semibold">New treasury →</Link>
        </div>

        <button
          type="button"
          aria-label={mobileOpen ? "Close navigation" : "Open navigation"}
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen((open) => !open)}
          className="fw-secondary-button cursor-pointer rounded-lg p-2.5 text-ledger-200 md:hidden"
        >
          <span className={`block h-0.5 w-5 bg-current transition ${mobileOpen ? "translate-y-2 rotate-45" : ""}`} />
          <span className={`mt-1.5 block h-0.5 w-5 bg-current transition ${mobileOpen ? "opacity-0" : ""}`} />
          <span className={`mt-1.5 block h-0.5 w-5 bg-current transition ${mobileOpen ? "-translate-y-2 -rotate-45" : ""}`} />
        </button>
      </div>

      {mobileOpen && <div className="absolute inset-x-0 top-full border-b border-ledger-800 bg-ledger-950/95 shadow-2xl backdrop-blur-xl md:hidden">
        <div className="mx-auto max-w-7xl px-4 py-4">
          <div className="overflow-hidden rounded-2xl border border-ledger-800 bg-ledger-900/60">{NAV_ITEMS.map(({to,label}) => navLink(to, label, true))}</div>
          <div className="mt-4 grid gap-3">
            {!resolving && account ? <>
              <div className="flex items-center justify-between rounded-xl border border-ledger-800 bg-ledger-950/60 px-4 py-3 text-xs text-ledger-400"><span>Connected</span><span className="font-data">{short(account.address)}</span></div>
              <button type="button" disabled={loggingOut} onClick={()=>void handleLogout()} className="fw-secondary-button cursor-pointer rounded-xl px-4 py-3 text-sm text-ledger-300 disabled:cursor-not-allowed disabled:opacity-50">{loggingOut ? "Signing out…" : "Log out"}</button>
            </> : !resolving ? <Link to="/signup" className="fw-secondary-button rounded-xl px-4 py-3 text-center text-sm text-ledger-200">Sign in</Link> : null}
            <Link to={newTreasuryPath} className="fw-primary-button rounded-xl px-4 py-3 text-center text-sm font-semibold">New treasury →</Link>
          </div>
        </div>
      </div>}
    </nav>

    <div className="flex-1">{children}</div>

    <footer className="relative shrink-0 overflow-hidden border-t border-ledger-800 bg-ledger-950/90">
      <div className="fw-ambient-orb -bottom-44 -left-32 h-80 w-80 bg-copper-500/10" />
      <div className="relative z-10 mx-auto max-w-7xl px-4 py-10 sm:px-6 md:py-14">
        <div className="grid gap-10 sm:grid-cols-2 md:grid-cols-[1.5fr_.75fr_.75fr]">
          <section className="sm:col-span-2 md:col-span-1">
            <Link to="/" aria-label="Fair Witness home" className="inline-flex"><img src="/fair-witness-logo.svg" alt="Fair Witness" className="h-11 w-auto sm:h-12" /></Link>
            <p className="mt-4 max-w-md text-sm leading-relaxed text-ledger-400">Trust-minimized execution for autonomous financial agents on Creditcoin. AI proposes. Deterministic policy authorizes. Treasury executes.</p>
            <div className="mt-5 flex flex-wrap gap-2 text-[10px] uppercase tracking-wide text-ledger-500"><span className="fw-status-chip">Non-custodial</span><span className="fw-status-chip">Attestcoin verified</span><span className="fw-status-chip">Replay protected</span></div>
          </section>

          <section><p className="text-[10px] font-semibold uppercase tracking-[.18em] text-ledger-300">Product</p><div className="mt-4 flex flex-col gap-3 text-sm text-ledger-500">{PRODUCT_LINKS.map(item => <Link key={item.to} to={item.to} className="transition hover:translate-x-0.5 hover:text-ledger-200">{item.label}</Link>)}</div></section>
          <section><p className="text-[10px] font-semibold uppercase tracking-[.18em] text-ledger-300">Protocol</p><div className="mt-4 flex flex-col gap-3 text-sm text-ledger-500">{TECH_LINKS.map(item => <Link key={item.to} to={item.to} className="transition hover:translate-x-0.5 hover:text-ledger-200">{item.label}</Link>)}<a href={`${config.explorerBaseUrl}/address/${config.factoryAddress}`} target="_blank" rel="noreferrer" className="transition hover:text-ledger-200">Factory contract ↗</a></div></section>
        </div>

        <div className="mt-10 flex flex-col gap-4 border-t border-ledger-800 pt-6 text-[10px] uppercase tracking-wide text-ledger-600 sm:flex-row sm:items-center sm:justify-between">
          <p className="inline-flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-verified-400" /> Fair Witness · Creditcoin CC3 public testnet</p>
          <p>Controlled market conditions · real verification and execution path</p>
        </div>
      </div>
    </footer>
  </div>;
}
