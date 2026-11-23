import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";

import { ApiError } from "@/lib/api/client";
import type { CounselorDiary, RoleCode } from "@/types/api";

const mocks = vi.hoisted(() => ({
  detail: vi.fn(),
  replace: vi.fn(),
  auth: {
    session: null as null | { accessToken: string; user: { role: { code: RoleCode }; firstName: string } },
    isAuthenticated: false,
    isLoading: false,
  },
  params: { id: "entry-one" },
}));

vi.mock("@/lib/api/counselor-diaries", () => ({
  getCounselorDiary: mocks.detail,
}));
vi.mock("@/components/auth/auth-provider", () => ({ useAuth: () => mocks.auth }));
vi.mock("next/navigation", () => ({
  useParams: () => mocks.params,
  usePathname: () => `/counselor/diaries/${mocks.params.id}`,
  useRouter: () => ({ replace: mocks.replace }),
}));
vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

import CounselorDiaryDetailPage from "@/app/counselor/diaries/[id]/page";

function authenticate(role: RoleCode = "COUNSELOR") {
  mocks.auth = {
    session: { accessToken: "token", user: { role: { code: role }, firstName: "Counselor" } },
    isAuthenticated: true,
    isLoading: false,
  };
}

function entry(id = "entry-one", overrides: Partial<CounselorDiary> = {}): CounselorDiary {
  return {
    id,
    createdAt: "2026-01-02T15:04:00.000Z",
    updatedAt: "2026-01-02T15:04:00.000Z",
    entryType: "THOUGHT_RECORD",
    content: { text: `Entry ${id}` },
    primaryEmotion: null,
    intensityBefore: null,
    intensityAfter: null,
    client: { id: "client-one", firstName: "Ada", lastName: "Client" },
    ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth = { session: null, isAuthenticated: false, isLoading: false };
  mocks.params = { id: "entry-one" };
});
afterEach(() => cleanup());

describe("counselor diary detail", () => {
  it("loads and renders client identity, metadata, emotion, intensity, content and back navigation", async () => {
    authenticate();
    mocks.detail.mockResolvedValue(entry("entry-one", {
      primaryEmotion: { id: "emotion-one", code: "CALM" },
      intensityBefore: 3,
      intensityAfter: 6,
    }));
    render(<CounselorDiaryDetailPage />);
    expect(screen.getByText("Loading shared diary entry…")).toBeTruthy();
    expect(await screen.findByText("Ada Client")).toBeTruthy();
    expect(screen.getByText("Thought Record")).toBeTruthy();
    expect(screen.getByText("Calm")).toBeTruthy();
    expect(screen.getByText("3")).toBeTruthy();
    expect(screen.getByText("6")).toBeTruthy();
    expect(screen.getByText("Entry entry-one")).toBeTruthy();
    expect(screen.getByRole("link", { name: /back to shared diaries/i }).getAttribute("href")).toBe("/counselor/diaries");
    expect(screen.getByRole("time").getAttribute("dateTime")).toBe("2026-01-02T15:04:00.000Z");
    expect(screen.queryByRole("button", { name: /edit|delete|share/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /edit|delete|manage sharing|recipients/i })).toBeNull();
  });

  it("renders structured JSON content and omits null optional fields", async () => {
    authenticate();
    mocks.detail.mockResolvedValue(entry("structured", { content: { mood: "calm", details: { note: "Private context" } } }));
    render(<CounselorDiaryDetailPage />);
    expect(await screen.findByText(/"mood": "calm"/)).toBeTruthy();
    expect(screen.queryByText("Primary emotion")).toBeNull();
    expect(screen.queryByText("Intensity before")).toBeNull();
    expect(screen.queryByText("Intensity after")).toBeNull();
  });

  it("uses a neutral unavailable message for 404 responses", async () => {
    authenticate();
    mocks.detail.mockRejectedValue(new ApiError("not found", 404));
    render(<CounselorDiaryDetailPage />);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("This shared entry is unavailable.");
    expect(alert.textContent).not.toContain("not found");
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("shows an access state for 403 responses", async () => {
    authenticate();
    mocks.detail.mockRejectedValue(new ApiError("forbidden", 403));
    render(<CounselorDiaryDetailPage />);
    expect((await screen.findByRole("alert")).textContent).toContain("counselor access is no longer active");
  });

  it("retries a retryable error", async () => {
    authenticate();
    mocks.detail.mockRejectedValueOnce(new Error("Temporary failure")).mockResolvedValueOnce(entry());
    render(<CounselorDiaryDetailPage />);
    expect((await screen.findByRole("alert")).textContent).toContain("Temporary failure");
    screen.getByRole("button", { name: "Try again" }).click();
    expect(await screen.findByText("Entry entry-one")).toBeTruthy();
    expect(mocks.detail).toHaveBeenCalledTimes(2);
  });

  it("requests the new route ID when the route changes", async () => {
    authenticate();
    mocks.detail.mockImplementation((_token: string, id: string) => Promise.resolve(entry(id, { content: { text: `Loaded ${id}` } })));
    const view = render(<CounselorDiaryDetailPage />);
    expect(await screen.findByText("Loaded entry-one")).toBeTruthy();
    mocks.params = { id: "entry-two" };
    view.rerender(<CounselorDiaryDetailPage />);
    expect(await screen.findByText("Loaded entry-two")).toBeTruthy();
    expect(mocks.detail).toHaveBeenLastCalledWith("token", "entry-two");
  });

  it("ignores a stale response after the route changes", async () => {
    authenticate();
    const first = deferred<CounselorDiary>();
    const second = deferred<CounselorDiary>();
    mocks.detail.mockImplementation((_token: string, id: string) => id === "entry-one" ? first.promise : second.promise);
    const view = render(<CounselorDiaryDetailPage />);
    await waitFor(() => expect(mocks.detail).toHaveBeenCalledWith("token", "entry-one"));
    mocks.params = { id: "entry-two" };
    view.rerender(<CounselorDiaryDetailPage />);
    await waitFor(() => expect(mocks.detail).toHaveBeenCalledWith("token", "entry-two"));
    await act(async () => second.resolve(entry("entry-two", { content: { text: "New route data" } })));
    expect(await screen.findByText("New route data")).toBeTruthy();
    await act(async () => first.resolve(entry("entry-one", { content: { text: "Stale route data" } })));
    expect(screen.queryByText("Stale route data")).toBeNull();
    expect(screen.getByText("New route data")).toBeTruthy();
  });

  it("ignores a response after unmount", async () => {
    authenticate();
    const pending = deferred<CounselorDiary>();
    mocks.detail.mockReturnValue(pending.promise);
    const view = render(<CounselorDiaryDetailPage />);
    await waitFor(() => expect(mocks.detail).toHaveBeenCalledTimes(1));
    view.unmount();
    await act(async () => pending.resolve(entry()));
    expect(screen.queryByText("Entry entry-one")).toBeNull();
  });

  it("does not fetch while unauthenticated", async () => {
    render(<CounselorDiaryDetailPage />);
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/login?redirect=%2Fcounselor%2Fdiaries%2Fentry-one"));
    expect(mocks.detail).not.toHaveBeenCalled();
  });

  it("does not fetch for a client session", async () => {
    authenticate("CLIENT");
    render(<CounselorDiaryDetailPage />);
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/dashboard"));
    expect(mocks.detail).not.toHaveBeenCalled();
  });
});
