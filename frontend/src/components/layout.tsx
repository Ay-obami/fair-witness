// Shared judge-facing navigation. Historical legacy routes remain addressable but are
// intentionally omitted because they are not compatible with the schema-v1 demo.
import { Link } from "react-router-dom";
import type { ReactNode } from "react";

const NAV_ITEMS = [
  { to: "/mandate", label: "Mandate" },
  { to: "/demo", label: "Demo" },
  { to: "/architecture", label: "Architecture" },
  { to: "/docs", label: "Help & docs" },
];

const FOOTER_LINKS = [
  { to: "/demo", label: "Controlled demo" },
  { to: "/mandate", label: "Mandate" },
  { to: "/docs", label: "Technical docs" },
  { to: "/architecture", label: "Architecture" },
];

export function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <nav className="border-b border-hairline">
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-4 px-4 py-4 sm:flex-row sm:justify-between sm:px-6">
          <Link to="/" className="text-sm font-semibold tracking-widest text-verified-400 uppercase">
            Fair Witness
          </Link>
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-3 text-sm sm:gap-x-6">
            {NAV_ITEMS.map(({ to, label }) => (
              <Link key={to} to={to} className="text-text-secondary hover:text-text-primary transition">
                {label}
              </Link>
            ))}
            <Link
              to="/demo"
              className="rounded-md bg-copper-500 px-4 py-1.5 text-xs font-semibold text-text-primary hover:bg-copper-400 transition"
            >
              Live demo
            </Link>
          </div>
        </div>
      </nav>

      {children}

      <footer className="border-t border-hairline py-6 mt-16">
        <div className="mx-auto max-w-5xl flex flex-col sm:flex-row items-center justify-between px-6 text-xs text-text-secondary">
          <p className="mb-2 sm:mb-0">Fair Witness — policy-bound execution for autonomous financial agents.</p>
          <div className="flex items-center gap-6">
            {FOOTER_LINKS.map(({ to, label }) => (
              <Link key={to} to={to} className="text-text-secondary hover:text-text-primary transition">
                {label}
              </Link>
            ))}
            <a
              href="https://creditcoin-testnet.blockscout.com/address/0x52C36499AA400F74432Eb327Cd1fB51Be573AeEd"
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
