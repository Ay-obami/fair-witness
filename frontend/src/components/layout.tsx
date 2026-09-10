import { Link } from "react-router-dom";
import type { ReactNode } from "react";

const NAV_ITEMS = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/treasury", label: "Treasury" },
  { to: "/evidence", label: "Evidence" },
  { to: "/architecture", label: "Architecture" },
  { to: "/docs", label: "Docs" },
];

export function Layout({ children }: { children: ReactNode }) {
  return <div className="min-h-screen bg-background">
    <nav className="border-b border-hairline">
      <div className="mx-auto flex max-w-5xl flex-col items-center gap-4 px-4 py-4 sm:flex-row sm:justify-between sm:px-6">
        <Link to="/" className="text-sm font-semibold tracking-widest text-verified-400 uppercase">Fair Witness</Link>
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-3 text-sm sm:gap-x-6">
          {NAV_ITEMS.map(({to,label})=><Link key={to} to={to} className="text-text-secondary transition hover:text-text-primary">{label}</Link>)}
          <Link to="/signup" className="rounded-md bg-copper-500 px-4 py-1.5 text-xs font-semibold text-ledger-950 hover:bg-copper-400">Launch Fair Witness</Link>
        </div>
      </div>
    </nav>
    {children}
    <footer className="mt-16 border-t border-hairline py-6"><div className="mx-auto flex max-w-5xl flex-col items-center justify-between px-6 text-xs text-text-secondary sm:flex-row"><p className="mb-2 sm:mb-0">Fair Witness — AI proposes. Deterministic policy authorizes. Treasury executes.</p><div className="flex flex-wrap items-center justify-center gap-5"><Link to="/evidence" className="hover:text-text-primary">Protocol evidence</Link><Link to="/docs" className="hover:text-text-primary">Technical docs</Link><a href="https://creditcoin-testnet.blockscout.com/address/0x52C36499AA400F74432Eb327Cd1fB51Be573AeEd" target="_blank" rel="noreferrer" className="hover:text-text-primary">Factory contract</a></div></div></footer>
  </div>;
}
