"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { logout as logoutRequest } from "@/lib/api/auth";
import {
  clearSession,
  readSession,
  saveAuthResponse,
  SESSION_EXPIRED_EVENT,
  SESSION_UPDATED_EVENT,
  type AuthSession,
} from "@/lib/auth/session";
import type { AuthResponse } from "@/types/api";

interface AuthContextValue {
  session: AuthSession | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  signIn: (response: AuthResponse) => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setSession(readSession());
      setIsLoading(false);
    });

    const handleSessionUpdated = () => setSession(readSession());
    const handleSessionExpired = () => setSession(null);

    window.addEventListener(SESSION_UPDATED_EVENT, handleSessionUpdated);
    window.addEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener(SESSION_UPDATED_EVENT, handleSessionUpdated);
      window.removeEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired);
    };
  }, []);

  const signIn = useCallback((response: AuthResponse) => {
    setSession(saveAuthResponse(response));
  }, []);

  const signOut = useCallback(async () => {
    const refreshToken = session?.refreshToken ?? readSession()?.refreshToken;
    clearSession(false);
    setSession(null);

    try {
      if (refreshToken) {
        await logoutRequest(refreshToken);
      }
    } catch {
      // Local logout is complete even if the server is unreachable.
    }
  }, [session]);

  const value = useMemo(
    () => ({
      session,
      isLoading,
      isAuthenticated: session !== null,
      signIn,
      signOut,
    }),
    [isLoading, session, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }

  return context;
}
