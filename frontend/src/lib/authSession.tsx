import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Account } from "thirdweb/wallets";
import { client, thirdwebConfigured, wallet } from "./thirdweb";

type AuthSessionValue = {
  account: Account | undefined;
  resolving: boolean;
  setSessionAccount: (account: Account | undefined) => void;
  refreshSession: () => Promise<Account | undefined>;
};

const AuthSessionContext = createContext<AuthSessionValue | null>(null);

export function AuthSessionProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<Account | undefined>(() => wallet.getAccount());
  const [resolving, setResolving] = useState(() => thirdwebConfigured && !wallet.getAccount());

  async function refreshSession() {
    if (!thirdwebConfigured) {
      setResolving(false);
      return undefined;
    }
    const current = wallet.getAccount();
    if (current) {
      setAccount(current);
      setResolving(false);
      return current;
    }
    setResolving(true);
    try {
      const connected = await wallet.autoConnect({ client });
      const resolved = connected ?? wallet.getAccount();
      setAccount(resolved);
      return resolved;
    } catch {
      setAccount(undefined);
      return undefined;
    } finally {
      setResolving(false);
    }
  }

  useEffect(() => { void refreshSession(); }, []);

  const value = useMemo<AuthSessionValue>(() => ({
    account,
    resolving,
    setSessionAccount: setAccount,
    refreshSession,
  }), [account, resolving]);

  return <AuthSessionContext.Provider value={value}>{children}</AuthSessionContext.Provider>;
}

export function useAuthSession() {
  const value = useContext(AuthSessionContext);
  if (!value) throw new Error("useAuthSession must be used inside AuthSessionProvider");
  return value;
}
