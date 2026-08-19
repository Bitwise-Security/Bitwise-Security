import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { PropsWithChildren } from "react";
import { api, loadSession, setCsrfToken } from "./api";
import type { SessionResponse, SessionUser } from "./api";

interface AuthState {
  user: SessionUser | null;
  loading: boolean;
  establish: (session: SessionResponse) => void;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const session = await loadSession();
    setUser(session?.user ?? null);
  }, []);

  useEffect(() => {
    let active = true;
    void loadSession()
      .then((session) => {
        if (active) setUser(session?.user ?? null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const establish = useCallback((session: SessionResponse) => {
    setCsrfToken(session.csrfToken);
    setUser(session.user);
  }, []);

  const logout = useCallback(async () => {
    await api<void>("/api/v1/auth/logout", { method: "POST" });
    setCsrfToken(null);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, loading, establish, logout, refresh }),
    [user, loading, establish, logout, refresh],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
