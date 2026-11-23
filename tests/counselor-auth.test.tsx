import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { RoleCode } from "@/types/api";
import { ApiError } from "@/lib/api/client";

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  signIn: vi.fn(),
  login: vi.fn(),
  listRelationships: vi.fn(),
  requestRelationship: vi.fn(),
  auth: { session: null as null | { accessToken: string; user: { id: string; firstName: string; role: { code: RoleCode } } }, isAuthenticated: false, isLoading: false, signOut: vi.fn() },
  redirect: null as string | null,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace }),
  usePathname: () => "/counselor/dashboard",
  useSearchParams: () => ({ get: () => mocks.redirect }),
}));
vi.mock("next/link", () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }));
vi.mock("@/components/auth/auth-provider", () => ({ useAuth: () => ({ ...mocks.auth, signIn: mocks.signIn }) }));
vi.mock("@/lib/api/auth", () => ({ login: mocks.login }));
vi.mock("@/lib/api/relationships", () => ({ listRelationships: mocks.listRelationships, requestRelationship: mocks.requestRelationship }));

import CounselorDashboardPage from "@/app/counselor/dashboard/page";
import LoginPage from "@/app/login/page";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth = { session: null, isAuthenticated: false, isLoading: false, signOut: vi.fn() };
  mocks.redirect = null;
  mocks.listRelationships.mockResolvedValue([]);
});
afterEach(() => cleanup());

function authenticate(role: RoleCode) {
  mocks.auth = { session: { accessToken: "mock-token", user: { id: "mock-id", firstName: "Test", role: { code: role } } }, isAuthenticated: true, isLoading: false, signOut: vi.fn() };
}

describe("counselor dashboard protection", () => {
  it("renders and loads relationships for a counselor", async () => {
    authenticate("COUNSELOR");
    render(<CounselorDashboardPage />);
    expect(screen.getByRole("heading", { name: /welcome back/i })).toBeTruthy();
    await waitFor(() => expect(mocks.listRelationships).toHaveBeenCalledTimes(1));
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it.each(["CLIENT", "ADMIN"] as const)("redirects %s without rendering or fetching", async (role) => {
    authenticate(role);
    render(<CounselorDashboardPage />);
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/dashboard"));
    expect(screen.queryByRole("heading", { name: /welcome back/i })).toBeNull();
    expect(mocks.listRelationships).not.toHaveBeenCalled();
  });

  it("redirects unauthenticated users to login without fetching", async () => {
    render(<CounselorDashboardPage />);
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/login?redirect=%2Fcounselor%2Fdashboard"));
    expect(screen.queryByRole("heading", { name: /welcome back/i })).toBeNull();
    expect(mocks.listRelationships).not.toHaveBeenCalled();
  });
});

describe("counselor dashboard relationships", () => {
  const clientId = "a39d0588-aca4-443e-b261-3829ae6958ae";

  function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<T>((resolvePromise, rejectPromise) => {
      resolve = resolvePromise;
      reject = rejectPromise;
    });
    return { promise, resolve, reject };
  }

  async function renderDashboard() {
    authenticate("COUNSELOR");
    render(<CounselorDashboardPage />);
    await waitFor(() => expect(mocks.listRelationships).toHaveBeenCalledTimes(1));
  }

  function submitClientId(value: string) {
    fireEvent.change(screen.getByLabelText("Client ID (UUID)"), { target: { value } });
    fireEvent.submit(screen.getByRole("button", { name: "Send request" }).closest("form")!);
  }

  it("shows loading until the relationship list resolves", async () => {
    const pending = deferred<[]>();
    mocks.listRelationships.mockReturnValue(pending.promise);
    await renderDashboard();
    expect(screen.getByText("Loading relationships…")).toBeTruthy();
    expect(screen.queryByText("No pending requests.")).toBeNull();
    await act(async () => pending.resolve([]));
    expect(await screen.findByText("No pending requests.")).toBeTruthy();
    expect(screen.queryByText("Loading relationships…")).toBeNull();
  });

  it("shows an empty state for each relationship status", async () => {
    await renderDashboard();
    expect(await screen.findByText("No pending requests.")).toBeTruthy();
    expect(screen.getByText("No active client relationships.")).toBeTruthy();
    expect(screen.getByText("No rejected requests.")).toBeTruthy();
    expect(screen.getByText("No revoked relationships.")).toBeTruthy();
  });

  it("shows a list error and allows a successful retry", async () => {
    mocks.listRelationships.mockRejectedValueOnce(new Error("Could not load relationships."));
    await renderDashboard();
    await screen.findByRole("alert");
    expect(screen.getByRole("alert").textContent).toContain("Could not load relationships.");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("No pending requests.")).toBeTruthy();
    expect(mocks.listRelationships).toHaveBeenCalledTimes(2);
  });

  it("submits a valid request, shows success, clears the field and refreshes the list", async () => {
    mocks.requestRelationship.mockResolvedValue({});
    mocks.listRelationships.mockResolvedValueOnce([]).mockResolvedValueOnce([{
      id: "relationship-id", counselorId: "mock-id", clientId, status: "PENDING",
      requestedAt: "2026-01-01T00:00:00.000Z", respondedAt: null, endedAt: null,
      client: { firstName: "Example", lastName: "Client", email: "client@example.com" },
    }]);
    await renderDashboard();
    await screen.findByText("No pending requests.");
    submitClientId(` ${clientId} `);
    await screen.findByRole("status");
    expect(screen.getByRole("status").textContent).toBe("Relationship request sent.");
    expect(mocks.requestRelationship).toHaveBeenCalledWith("mock-token", clientId);
    expect((screen.getByLabelText("Client ID (UUID)") as HTMLInputElement).value).toBe("");
    expect(await screen.findByText("Example Client")).toBeTruthy();
    expect(mocks.listRelationships).toHaveBeenCalledTimes(2);
  });

  it("rejects an invalid UUID without calling the API", async () => {
    await renderDashboard();
    submitClientId("not-a-uuid");
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Enter a valid client UUID.");
    expect(mocks.requestRelationship).not.toHaveBeenCalled();
  });

  it("prevents repeat submissions while a request is pending", async () => {
    const pending = deferred<object>();
    mocks.requestRelationship.mockReturnValue(pending.promise);
    await renderDashboard();
    await screen.findByText("No pending requests.");
    submitClientId(clientId);
    const button = screen.getByRole("button", { name: "Sending…" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.submit(button.closest("form")!);
    expect(mocks.requestRelationship).toHaveBeenCalledTimes(1);
    await act(async () => pending.resolve({}));
    expect(await screen.findByRole("status")).toBeTruthy();
  });

  it("shows a submission API error without clearing the input or refreshing", async () => {
    mocks.requestRelationship.mockRejectedValue(new Error("Relationship already exists."));
    await renderDashboard();
    await screen.findByText("No pending requests.");
    submitClientId(clientId);
    expect((await screen.findByRole("alert")).textContent).toBe("Relationship already exists.");
    expect((screen.getByLabelText("Client ID (UUID)") as HTMLInputElement).value).toBe(clientId);
    expect(mocks.listRelationships).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("refreshes the list after a stale duplicate request error", async () => {
    mocks.requestRelationship.mockRejectedValue(new ApiError("Relationship already exists.", 409));
    await renderDashboard();
    await screen.findByText("No pending requests.");
    submitClientId(clientId);
    expect((await screen.findByRole("alert")).textContent).toBe("Relationship already exists.");
    await waitFor(() => expect(mocks.listRelationships).toHaveBeenCalledTimes(2));
    expect(screen.getByRole("alert").textContent).toBe("Relationship already exists.");
  });
});

describe("login redirects", () => {
  async function submitLogin(role: RoleCode, redirect: string | null = null) {
    mocks.redirect = redirect;
    mocks.login.mockResolvedValue({ user: { role: { code: role } } });
    render(<LoginPage />);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "user@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "mock-password" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(mocks.replace).toHaveBeenCalled());
  }

  it.each([["COUNSELOR", "/counselor/dashboard"], ["CLIENT", "/dashboard"]] as const)("redirects %s to %s by default", async (role, destination) => {
    await submitLogin(role);
    expect(mocks.replace).toHaveBeenCalledWith(destination);
  });

  it("preserves a safe internal redirect including query and fragment", async () => {
    await submitLogin("CLIENT", "/diaries?view=recent#entries");
    expect(mocks.replace).toHaveBeenCalledWith("/diaries?view=recent#entries");
  });

  it.each(["https://example.com", "//example.com", "/\\example.com"])("rejects unsafe redirect %s", async (redirect) => {
    await submitLogin("CLIENT", redirect);
    expect(mocks.replace).toHaveBeenCalledWith("/dashboard");
  });

  it("does not send a client to the counselor route via an explicit redirect", async () => {
    await submitLogin("CLIENT", "/counselor/dashboard");
    expect(mocks.replace).toHaveBeenCalledWith("/dashboard");
  });
});
