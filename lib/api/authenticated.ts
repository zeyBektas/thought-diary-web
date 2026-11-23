import { apiFetch, type ApiRequestOptions, ApiError } from "./client";
import { getAccessToken, getSessionGeneration, refreshSession } from "@/lib/auth/session";

export async function authenticatedFetch<T>(
  path: string,
  options: ApiRequestOptions = {},
) {
  const accessToken = options.accessToken ?? getAccessToken();
  const generation = getSessionGeneration();

  try {
    return await apiFetch<T>(path, {
      ...options,
      accessToken,
    });
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401) {
      throw error;
    }

    if (generation !== getSessionGeneration()) throw error;
    const currentToken = getAccessToken();
    if (currentToken && currentToken !== accessToken) {
      return apiFetch<T>(path, { ...options, accessToken: currentToken });
    }
    const refreshedSession = await refreshSession();
    if (!refreshedSession) {
      throw error;
    }

    return apiFetch<T>(path, {
      ...options,
      accessToken: refreshedSession.accessToken,
    });
  }
}
