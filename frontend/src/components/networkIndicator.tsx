// Persistent indicator showing demo vs live mode + the configured network.
// Wires to config.demoMode — never hardcodes "LIVE".
import { config } from "../lib/config";

export function NetworkIndicator() {
  if (!config.demoMode) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-external-500/30 bg-external-500/10 px-2.5 py-1 text-xs font-data uppercase tracking-wide text-external-400">
        <span className="h-1.5 w-1.5 rounded-full bg-external-500" />
        Live — CC3 testnet
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-alert-500/30 bg-alert-500/10 px-2.5 py-1 text-xs font-data uppercase tracking-wide text-alert-400">
      <span className="h-1.5 w-1.5 rounded-full bg-alert-500" />
      Demo mode
    </span>
  );
}
