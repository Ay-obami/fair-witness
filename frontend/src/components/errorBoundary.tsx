// Top-level error boundary for the routed surface (Planning Part 1, Phase 0).
// A render failure on one page must never blank the whole app. Falls back to the
// same forensic-ledger look, shows the error verbatim (Fair Witness doesn't hide
// failures), and offers reload / back-home. React error boundaries must be classes.
import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

export class ErrorBoundary extends Component<Props, { error: string | null }> {
  state = { error: null as string | null };

    static getDerivedStateFromError(error: unknown): { error: string } {
    return { error: error instanceof Error ? error.message : String(error) };
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-background">
          <div className="mx-auto max-w-xl px-6 py-24">
            <p className="text-xs uppercase tracking-widest text-alert-400">Something failed rendering this page</p>
            <h1 className="mt-4 text-2xl font-semibold text-text-primary">This page didn't render.</h1>
            <p className="mt-3 text-sm leading-relaxed text-text-secondary">
              The error below is shown verbatim. Reload to retry, or head back to the ledger —
              nothing here was caused by your contract or your funds.
            </p>
            <pre className="mt-6 overflow-x-auto rounded-md border border-hairline bg-surface px-4 py-3 font-data text-xs text-alert-400">
              {this.state.error}
            </pre>
            <div className="mt-6 flex gap-3">
              <button
                className="rounded-md bg-copper-500 px-4 py-2 text-sm font-semibold text-text-primary hover:bg-copper-400 transition"
                onClick={() => window.location.reload()}
              >
                Reload
              </button>
              <a href="/" className="rounded-md border border-hairline px-4 py-2 text-sm text-text-secondary hover:text-verified-400">
                Back to the ledger
              </a>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}