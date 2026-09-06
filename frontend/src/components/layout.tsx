// Shared layout — one canonical nav + footer for every route (Planning Part 1, Phase 0).
// Before this, each page defined its own nav with a different item set/order. The set
// below is THE set: Dashboard, Verify, Help & docs, and a copper Sign-up CTA. Teal is
// reserved strictly for verified/status states — buttons/CTAs are copper, never teal.
import { Link } from "react-router-dom";
import type { ReactNode } from "react";

const NAV_ITEMS = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/treasury", label: "Treasury" },
  { to: "/verify", label: "Verify" },
  { to: "/architecture", label: "Architecture" },
  { to: "/docs", label: "Help & docs" },
];

const FOOTER_LINKS = [
  { to: "/verify", label: "Verify an action" },
  { to: "/dashboard", label: "Your instances" },
  { to: "/treasury", label: "Treasury viewer" },
  { to: "/docs", label: "Technical docs" },
  { to: "/architecture", label: "Architecture" },
];

export function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <nav className="border-b border-hairline">
        <div className="mx-auto max-w-5xl flex items-center justify-between px-6 py-4">
          <Link to="/" className="text-sm font-semibold tracking-widest text-verified-400 uppercase">
            Fair Witness
          </Link>
          <div className="flex items-center gap-6 text-sm">
            {NAV_ITEMS.map(({ to, label }) => (
              <Link key={to} to={to} className="text-text-secondary hover:text-text-primary transition">
                {label}
              </Link>
            ))}
            <Link
              to="/signup"
              className="rounded-md bg-copper-500 px-4 py-1.5 text-xs font-semibold text-text-primary hover:bg-copper-400 transition"
            >
              Sign up
            </Link>
          </div>
        </div>
      </nav>

      {children}

      <footer className="border-t border-hairline py-6 mt-16">
        <div className="mx-auto max-w-5xl flex flex-col sm:flex-row items-center justify-between px-6 text-xs text-text-secondary">
          <p className="mb-2 sm:mb-0">Fair Witness — custody-free arbitrage with on-chain proof of intent.</p>
          <div className="flex items-center gap-6">
            {FOOTER_LINKS.map(({ to, label }) => (
              <Link key={to} to={to} className="text-text-secondary hover:text-text-primary transition">
                {label}
              </Link>
            ))}
            <a
              href="https://creditcoin-testnet.blockscout.com/address/0x97c81D68BbCDb1A673b61176d60F071963Abe7f2"
              target="_blank"
              rel="noopener noreferrer"
              className="text-text-secondary hover:text-text-primary transition"
            >
              Factory contract
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}