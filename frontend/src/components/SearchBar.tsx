import { useState } from "react";
import { config } from "../lib/config";
import { MOCK_ACTION_KEYS } from "../lib/mockData";

interface Props {
  onSearch: (actionKey: string) => void;
  loading: boolean;
}

const CHIP_LABELS: Record<string, string> = {
  "0xaa11": "Verified execution",
  "0xbb22": "Tampered reasoning (demo)",
  "0xcc33": "Reasoning unavailable",
};

export function SearchBar({ onSearch, loading }: Props) {
  const [value, setValue] = useState("");

  return (
    <div className="space-y-3">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (value.trim()) onSearch(value.trim());
        }}
        className="flex gap-2"
      >
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Paste an actionKey (0x...)"
          className="font-data flex-1 rounded-md border border-ledger-600 bg-ledger-900 px-4 py-2.5 text-sm text-ledger-100 placeholder:text-ledger-400 focus:border-verified-500/60 focus:outline-none"
        />
        <button
          type="submit"
          disabled={loading || !value.trim()}
          className="rounded-md bg-verified-500 px-5 py-2.5 text-sm font-semibold text-ledger-950 transition hover:bg-verified-400 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {loading ? "Loading…" : "Replay"}
        </button>
      </form>

      {config.demoMode && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs uppercase tracking-wide text-ledger-400">Try:</span>
          {MOCK_ACTION_KEYS.map((key) => (
            <button
              key={key}
              onClick={() => {
                setValue(key);
                onSearch(key);
              }}
              className="rounded-full border border-ledger-600 bg-ledger-800 px-3 py-1 text-xs text-ledger-200 transition hover:border-verified-500/50 hover:text-verified-400"
            >
              {CHIP_LABELS[key] ?? key}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
