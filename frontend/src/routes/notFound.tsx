// Catch-all route (Planning Part 1, Phase 0): a real NotFound page styled with the
// same forensic-ledger tokens, not the browser default. Deep links that miss a route
// land here with a way back into the product.
import { Link } from "react-router-dom";
import { Layout } from "../components/layout";

export default function NotFound() {
  return (
    <Layout>
      <div className="mx-auto max-w-xl px-6 py-24 text-center">
        <p className="text-7xl font-bold text-copper-500">404</p>
        <p className="mt-2 text-xs uppercase tracking-widest text-text-secondary">Page not found</p>
        <h1 className="mt-4 text-2xl font-semibold text-text-primary">This isn't in the ledger.</h1>
        <p className="mt-3 text-sm leading-relaxed text-text-secondary">
          The address you followed doesn't match any page in this build. If you were
          expecting a journal entry, use the Verify page to replay an actionKey.
        </p>
        <div className="mt-6 flex gap-3 justify-center">
          <Link
            to="/"
            className="rounded-md bg-copper-500 px-5 py-2.5 text-sm font-semibold text-text-primary hover:bg-copper-400 transition"
          >
            Back home
          </Link>
          <Link
            to="/verify"
            className="rounded-md border border-hairline px-5 py-2.5 text-sm text-text-secondary hover:text-verified-400 transition"
          >
            Verify an action
          </Link>
        </div>
      </div>
    </Layout>
  );
}