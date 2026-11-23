import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthResponse } from "@/types/api";

const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("@/lib/api/client", () => ({
  apiFetch: mocks.fetch,
  ApiError: class ApiError extends Error { constructor(message: string, public status: number) { super(message); } },
}));
import { ApiError } from "@/lib/api/client";
import { authenticatedFetch } from "@/lib/api/authenticated";
import { clearSession, getSessionGeneration, readSession, refreshSession, saveAuthResponse } from "@/lib/auth/session";
import { getDiary } from "@/lib/api/diaries";
import { listEmotions } from "@/lib/api/emotions";

const auth = (id: string): AuthResponse => ({ user: { id, email: "mock@example.com", username: null, firstName: "Mock", lastName: "User", phone: null, status: "ACTIVE", role: { id: "role", code: "CLIENT" } }, accessToken: `access-${id}`, refreshToken: `refresh-${id}` });
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
beforeEach(() => { clearSession(false); vi.resetAllMocks(); });

describe("session refresh races", () => {
  it("does not restore a session after logout", async () => {
    saveAuthResponse(auth("a"));
    const pending = deferred<object>(); mocks.fetch.mockReturnValue(pending.promise);
    const refresh = refreshSession(); clearSession(false);
    pending.resolve({ accessToken: "new", refreshToken: "new-refresh" });
    expect(await refresh).toBeNull(); expect(readSession()).toBeNull();
  });
  it("does not overwrite a replacement session", async () => {
    saveAuthResponse(auth("a"));
    const pending = deferred<object>(); mocks.fetch.mockReturnValue(pending.promise);
    const refresh = refreshSession(); saveAuthResponse(auth("b"));
    pending.resolve({ accessToken: "new", refreshToken: "new-refresh" });
    expect(await refresh).toBeNull(); expect(readSession()?.user.id).toBe("b");
  });
  it("refreshes the current session normally", async () => {
    saveAuthResponse(auth("a")); mocks.fetch.mockResolvedValue({ accessToken: "new", refreshToken: "new-refresh" });
    expect((await refreshSession())?.accessToken).toBe("new"); expect(readSession()?.accessToken).toBe("new");
  });
  it("clears only the session whose refresh failed", async () => {
    saveAuthResponse(auth("a")); mocks.fetch.mockRejectedValueOnce(new Error("failed"));
    expect(await refreshSession()).toBeNull(); expect(readSession()).toBeNull();
    saveAuthResponse(auth("a")); const pending = deferred<object>(); mocks.fetch.mockReturnValueOnce(pending.promise);
    const refresh = refreshSession(); saveAuthResponse(auth("b")); pending.reject(new Error("failed"));
    expect(await refresh).toBeNull(); expect(readSession()?.user.id).toBe("b");
  });
});

describe("authenticated request retry", () => {
  it.each([
    { path: "/diaries/entry", load: () => getDiary("access-a", "entry") },
    { path: "/emotions", load: () => listEmotions("access-a") },
  ])("retries a late 401 from $path after a successful refresh without changing generation", async ({ path, load }) => {
    saveAuthResponse(auth("a"));
    const generation = getSessionGeneration();
    const pending = deferred<unknown>();
    const result = { value: path };
    mocks.fetch.mockImplementation((url: string, options: { accessToken?: string }) => {
      if (url === "/auth/refresh") return Promise.resolve({ accessToken: "new", refreshToken: "new-refresh" });
      if (url === path && options.accessToken === "access-a") return pending.promise;
      if (url === path && options.accessToken === "new") return Promise.resolve(result);
      return Promise.reject(new Error("Unexpected request"));
    });
    const request = load();
    await expect(refreshSession()).resolves.toMatchObject({ accessToken: "new" });
    expect(getSessionGeneration()).toBe(generation);
    pending.reject(new ApiError("unauthorized", 401));
    await expect(request).resolves.toEqual(result);
    expect(mocks.fetch.mock.calls.filter(([url]) => url === path)).toHaveLength(2);
    expect(mocks.fetch.mock.calls.filter(([url]) => url === "/auth/refresh")).toHaveLength(1);
  });
  it("does not retry an old request after an account change", async () => {
    saveAuthResponse(auth("a"));
    const pending = deferred<unknown>();
    mocks.fetch.mockReturnValueOnce(pending.promise);
    const request = getDiary("access-a", "entry");
    saveAuthResponse(auth("b"));
    pending.reject(new ApiError("unauthorized", 401));
    await expect(request).rejects.toBeInstanceOf(ApiError);
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(readSession()?.user.id).toBe("b");
  });
  it("reuses a new token when a second old request receives a late 401", async () => {
    saveAuthResponse(auth("a")); const late = deferred<object>();
    mocks.fetch.mockImplementation((path: string, options: { accessToken?: string }) => {
      if (path === "/auth/refresh") return Promise.resolve({ accessToken: "new", refreshToken: "new-refresh" });
      if (options.accessToken === "new") return Promise.resolve({ ok: true });
      return path === "/first" ? Promise.reject(new ApiError("unauthorized", 401)) : late.promise;
    });
    const first = authenticatedFetch("/first"); const second = authenticatedFetch("/second");
    await expect(first).resolves.toEqual({ ok: true });
    late.reject(new ApiError("unauthorized", 401));
    await expect(second).resolves.toEqual({ ok: true });
    expect(mocks.fetch.mock.calls.filter(([path]) => path === "/auth/refresh")).toHaveLength(1);
  });
  it("clears on a genuine refresh failure and does not retry indefinitely", async () => {
    saveAuthResponse(auth("a")); mocks.fetch.mockRejectedValue(new ApiError("unauthorized", 401));
    await expect(authenticatedFetch("/data")).rejects.toBeInstanceOf(ApiError);
    expect(mocks.fetch).toHaveBeenCalledTimes(2); expect(readSession()).toBeNull();
  });
  it("does not refresh again if the retry also returns 401", async () => {
    saveAuthResponse(auth("a"));
    mocks.fetch.mockImplementation((path: string) => path === "/auth/refresh" ? Promise.resolve({ accessToken: "new", refreshToken: "new-refresh" }) : Promise.reject(new ApiError("unauthorized", 401)));
    await expect(authenticatedFetch("/data")).rejects.toBeInstanceOf(ApiError);
    expect(mocks.fetch).toHaveBeenCalledTimes(3);
  });
});
