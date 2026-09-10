import { Link, useLocation } from "react-router-dom";
import type { ReactNode } from "react";

const NAV_ITEMS = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/activity", label: "Activity" },
  { to: "/safeguards", label: "Safeguards" },
  { to: "/evidence", label: "Evidence" },
];

export function Layout({ children }: { children: ReactNode }) {
  const location = useLocation();
  return <div className="min-h-screen bg-background">
    <nav className="border-b border-hairline">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-4 py-4 sm:flex-row sm:justify-between sm:px-6">
        <Link to="/" className="text-sm font-semibold tracking-widest text-verified-400 uppercase">Fair Witness</Link>
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-3 text-sm sm:gap-x-4">
          {NAV_ITEMS.map(({to,label}) => {
            const active = location.pathname === to || (to === "/dashboard" && location.pathname.startsWith("/dashboard/"));
            return <Link key={to} to={to} aria-current={active ? "page" : undefined} className={`relative rounded-md px-3 py-1.5 transition ${active ? "bg-ledger-800 text-ledger-100" : "text-text-secondary hover:bg-ledger-900 hover:text-text-primary"}`}>
              {label}
              {active && <span className="absolute inset-x-3 -bottom-[17px] h-0.5 rounded bg-copper-400" />}
            </Link>;
          })}
          <Link to="/signup" className={`rounded-md px-4 py-1.5 text-xs font-semibold transition ${location.pathname === "/signup" || location.pathname === "/mandate" ? "bg-copper-400 text-ledger-950 ring-2 ring-copper-400/20" : "bg-copper-500 text-ledger-950 hover:bg-copper-400"}`}>New treasury</Link>
        </div>
      </div>
    </nav>
    {children}
    <footer className="mt-16 border-t border-hairline py-6"><div className="mx-auto flex max-w-6xl flex-col items-center justify-between px-6 text-xs text-text-secondary sm:flex-row"><p className="mb-2 sm:mb-0">Fair Witness — AI proposes. Deterministic policy authorizes. Treasury executes.</p><div className="flex flex-wrap items-center justify-center gap-5"><Link to="/evidence" className="hover:text-text-primary">Protocol evidence</Link><Link to="/architecture" className="hover:text-text-primary">Architecture</Link><Link to="/docs" className="hover:text-text-primary">Technical docs</Link><a href="https://creditcoin-testnet.blockscout.com/address/0x52C36499AA400F74432Eb327Cd1fB51Be573AeEd" target="_blank" rel="noreferrer" className="hover:text-text-primary">Factory contract</a></div></div></footer>
  </div>;
}
