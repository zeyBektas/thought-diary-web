import type { ApiUser, AuthResponse } from "@/types/api";
import { apiFetch } from "@/lib/api/client";

const STORAGE_KEY = "thought-diary.auth-session";
let sessionGeneration = 0;
export const SESSION_UPDATED_EVENT = "thought-diary:session-updated";
export const SESSION_EXPIRED_EVENT = "thought-diary:session-expired";

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  user: ApiUser;
}

type RefreshResponse = Pick<AuthResponse, "accessToken" | "refreshToken">;

function canUseStorage() {
  return typeof window !== "undefined" && "sessionStorage" in window;
}

function notify(eventName: string) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(eventName));
  }
}

export function readSession(): AuthSession | null {
  if (!canUseStorage()) {
    return null;
  }

  try {
    const stored = window.sessionStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return null;
    }

    const session = JSON.parse(stored) as Partial<AuthSession>;
    if (
      typeof session.accessToken !== "string" ||
      typeof session.refreshToken !== "string" ||
      !session.user
    ) {
      clearSession(false);
      return null;
    }

    return session as AuthSession;
  } catch {
    clearSession(false);
    return null;
  }
}

export function saveSession(session: AuthSession) {
  if (canUseStorage()) {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    notify(SESSION_UPDATED_EVENT);
  }

  return session;
}

export function saveAuthResponse(response: AuthResponse) {
  sessionGeneration += 1;
  return saveSession({
    accessToken: response.accessToken,
    refreshToken: response.refreshToken,
    user: response.user,
  });
}

export function getAccessToken() {
  return readSession()?.accessToken;
}

export function clearSession(notifyExpiry = true) {
  sessionGeneration += 1;
  if (canUseStorage()) {
    window.sessionStorage.removeItem(STORAGE_KEY);
  }

  if (notifyExpiry) {
    notify(SESSION_EXPIRED_EVENT);
  }
}

let refreshPromise: { generation: number; promise: Promise<AuthSession | null> } | null = null;

export function getSessionGeneration() {
  return sessionGeneration;
}

export function refreshSession() {
  if (refreshPromise?.generation === sessionGeneration) {
    return refreshPromise.promise;
  }

  const currentSession = readSession();
  if (!currentSession) {
    return Promise.resolve(null);
  }

  const generation = sessionGeneration;
  const isCurrent = () => {
    const session = readSession();
    return generation === sessionGeneration && session?.user.id === currentSession.user.id && session?.refreshToken === currentSession.refreshToken;
  };
  const promise = apiFetch<RefreshResponse>("/auth/refresh", {
    method: "POST",
    body: { refreshToken: currentSession.refreshToken },
  })
    .then((tokens: RefreshResponse) =>
      isCurrent() ? saveSession({
        ...currentSession,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      }) : null,
    )
    .catch(() => {
      if (isCurrent()) clearSession();
      return null;
    })
    .finally(() => {
      if (refreshPromise?.promise === promise) refreshPromise = null;
    });

  refreshPromise = { generation, promise };
  return promise;
}
