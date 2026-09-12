import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { client, thirdwebConfigured, wallet } from "./thirdweb";

type WalletAccount = NonNullable<ReturnType<typeof wallet.getAccount>>;
type AuthSessionValue = {
  account: WalletAccount | undefined;
  resolving: boolean;
  setSessionAccount: (account: WalletAccount | undefined) => void;
  refreshSession: () => Promise<WalletAccount | undefined>;
  logout: () => Promise<void>;
};

const AuthSessionContext = createContext<AuthSessionValue | null>(null);

export function AuthSessionProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<WalletAccount | undefined>(() => wallet.getAccount());
  const [resolving, setResolving] = useState(() => thirdwebConfigured && !wallet.getAccount());

  async function refreshSession(): Promise<WalletAccount | undefined> {
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

  async function logout() {
    setResolving(true);
    try {
      await wallet.disconnect();
      sessionStorage.removeItem("fair-witness:onboarding");
      setAccount(undefined);
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
    logout,
  }), [account, resolving]);

  return <AuthSessionContext.Provider value={value}>{children}</AuthSessionContext.Provider>;
}

export function useAuthSession() {
  const value = useContext(AuthSessionContext);
  if (!value) throw new Error("useAuthSession must be used inside AuthSessionProvider");
  return value;
}
