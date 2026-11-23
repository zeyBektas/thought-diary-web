import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Diary, DiarySharingState, Emotion } from "@/types/api";

const mocks = vi.hoisted(() => ({
  id: "a", token: "token", userId: "owner", get: vi.fn(), shares: vi.fn(), emotions: vi.fn(), counselors: vi.fn(), update: vi.fn(), replace: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useParams: () => ({ id: mocks.id }), useRouter: () => ({ replace: mocks.replace }) }));
vi.mock("next/link", () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }));
vi.mock("@/components/auth/auth-provider", () => ({ useAuth: () => ({ session: { accessToken: mocks.token, user: { id: mocks.userId, firstName: "Client" } }, signOut: vi.fn() }) }));
vi.mock("@/components/auth/protected-route", () => ({ ProtectedRoute: ({ children }: { children: React.ReactNode }) => children }));
vi.mock("@/lib/api/diaries", () => ({ getDiary: mocks.get, getDiaryShares: mocks.shares, updateDiary: mocks.update }));
vi.mock("@/lib/api/emotions", () => ({ listEmotions: mocks.emotions }));
vi.mock("@/lib/api/relationships", () => ({ listShareableCounselors: mocks.counselors }));

import EditDiaryPage from "@/app/diaries/[id]/edit/page";

const recipient = (id: string, name: string) => ({ relationshipId: id, counselor: { id: `user-${id}`, firstName: name, lastName: "Counselor", username: null } });
const ada = recipient("rel-a", "Ada");
const ben = recipient("rel-b", "Ben");
function entry(id: string): Diary {
  return { id, userId: "owner", entryType: "FREE_JOURNAL", primaryEmotionId: null, intensityBefore: null, intensityAfter: null, visibility: "COUNSELOR", content: { text: `Diary ${id}` }, createdAt: "2026-01-01", updatedAt: "2026-01-01", deletedAt: null };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
beforeEach(() => {
  vi.resetAllMocks(); mocks.id = "a"; mocks.token = "token"; mocks.userId = "owner";
  mocks.emotions.mockResolvedValue([]);
  mocks.counselors.mockResolvedValue({ counselors: [ada, ben] });
  mocks.update.mockResolvedValue({});
});
afterEach(cleanup);

describe("edit diary page sharing loading", () => {
  it.each(["diary", "emotions"])("keeps the initial %s request through a token refresh", async (pendingType) => {
    const diaryRequest = deferred<Diary>();
    const emotionRequest = deferred<Emotion[]>();
    mocks.get.mockReturnValue(pendingType === "diary" ? diaryRequest.promise : Promise.resolve(entry("a")));
    mocks.emotions.mockReturnValue(pendingType === "emotions" ? emotionRequest.promise : Promise.resolve([]));
    mocks.shares.mockResolvedValue({ shareVersion: "v1", recipients: [ada] });
    const view = render(<EditDiaryPage />);
    await waitFor(() => { expect(mocks.get).toHaveBeenCalledWith("token", "a"); expect(mocks.emotions).toHaveBeenCalledWith("token"); });
    mocks.token = "new-token"; view.rerender(<EditDiaryPage />);
    await waitFor(() => expect(mocks.shares).toHaveBeenCalledWith("new-token", "a"));
    await act(async () => { if (pendingType === "diary") diaryRequest.resolve(entry("a")); else emotionRequest.resolve([]); });
    expect(await screen.findByDisplayValue("Diary a")).toBeTruthy();
    expect(mocks.get).toHaveBeenCalledTimes(1);
    expect(mocks.emotions).toHaveBeenCalledTimes(1);
  });

  it("does not retry or display a previous account's pending diary request", async () => {
    const oldDiary = deferred<Diary>();
    mocks.get.mockReturnValueOnce(oldDiary.promise).mockResolvedValueOnce(entry("a"));
    mocks.shares.mockResolvedValue({ shareVersion: "v1", recipients: [ada] });
    const view = render(<EditDiaryPage />);
    await waitFor(() => expect(mocks.get).toHaveBeenCalledWith("token", "a"));
    mocks.userId = "another-owner"; mocks.token = "other-token"; view.rerender(<EditDiaryPage />);
    expect(await screen.findByDisplayValue("Diary a")).toBeTruthy();
    await act(async () => oldDiary.reject(new Error("Old account request failed")));
    expect(screen.queryByText("Old account request failed")).toBeNull();
    expect(mocks.get).toHaveBeenCalledTimes(2);
    expect(mocks.get).toHaveBeenLastCalledWith("other-token", "a");
  });

  it("ignores late diary and sharing responses from the previous route", async () => {
    const diaryA = deferred<Diary>(); const shareA = deferred<DiarySharingState>();
    const diaryB = deferred<Diary>(); const shareB = deferred<DiarySharingState>();
    mocks.get.mockImplementation((_token: string, id: string) => id === "a" ? diaryA.promise : diaryB.promise);
    mocks.shares.mockImplementation((_token: string, id: string) => id === "a" ? shareA.promise : shareB.promise);
    const view = render(<EditDiaryPage />);
    await waitFor(() => { expect(mocks.get).toHaveBeenCalledWith("token", "a"); expect(mocks.shares).toHaveBeenCalledWith("token", "a"); });
    mocks.id = "b"; view.rerender(<EditDiaryPage />);
    await waitFor(() => { expect(mocks.get).toHaveBeenCalledWith("token", "b"); expect(mocks.shares).toHaveBeenCalledWith("token", "b"); });
    await act(async () => { shareB.resolve({ shareVersion: "version-b", recipients: [ben] }); diaryB.resolve(entry("b")); });
    fireEvent.click(await screen.findByRole("button", { name: "Load counselor options" }));
    const benBox = await screen.findByRole("checkbox", { name: "Ben Counselor" }) as HTMLInputElement;
    expect(benBox.checked).toBe(true);
    await act(async () => { shareA.resolve({ shareVersion: "version-a", recipients: [ada] }); diaryA.reject(new Error("Late A error")); });
    expect(screen.queryByText("Late A error")).toBeNull();
    expect((screen.getByPlaceholderText("Begin wherever you are…") as HTMLTextAreaElement).value).toBe("Diary b");
    expect(benBox.checked).toBe(true);
    expect((screen.getByRole("checkbox", { name: "Ada Counselor" }) as HTMLInputElement).checked).toBe(false);
    fireEvent.click(benBox);
    fireEvent.submit(screen.getByRole("button", { name: "Save changes" }).closest("form")!);
    await waitFor(() => expect(mocks.update).toHaveBeenCalledWith("token", "b", expect.objectContaining({ recipientRelationshipIds: [], shareVersion: "version-b" })));
  });

  it("keeps existing sharing blocked until a failed initial share request is retried", async () => {
    mocks.get.mockResolvedValue(entry("a"));
    mocks.shares.mockRejectedValueOnce(new Error("Share service unavailable")).mockResolvedValueOnce({ shareVersion: "retry-version", recipients: [ada] });
    render(<EditDiaryPage />);
    expect((await screen.findByRole("alert")).textContent).toContain("Share service unavailable");
    expect(screen.queryByRole("button", { name: "Save changes" })).toBeNull();
    expect(mocks.update).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Retry sharing information" }));
    fireEvent.click(await screen.findByRole("button", { name: "Load counselor options" }));
    const checkbox = await screen.findByRole("checkbox", { name: "Ada Counselor" }) as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
    expect((screen.getByPlaceholderText("Begin wherever you are…") as HTMLTextAreaElement).value).toBe("Diary a");
    expect(mocks.get).toHaveBeenCalledTimes(1); expect(mocks.emotions).toHaveBeenCalledTimes(1); expect(mocks.shares).toHaveBeenCalledTimes(2);
    fireEvent.click(checkbox);
    fireEvent.submit(screen.getByRole("button", { name: "Save changes" }).closest("form")!);
    await waitFor(() => expect(mocks.update).toHaveBeenCalledWith("token", "a", expect.objectContaining({ recipientRelationshipIds: [], shareVersion: "retry-version" })));
  });

  it("preserves the complete draft across token refresh and requires review of changed sharing", async () => {
    const refreshed = deferred<DiarySharingState>();
    mocks.get.mockResolvedValue(entry("a"));
    mocks.emotions.mockResolvedValue([{ id: "75c75a98-c53d-41ed-b35a-7c4e87801ce0", code: "CALM", parentId: null }]);
    mocks.shares.mockResolvedValueOnce({ shareVersion: "v1", recipients: [ada] }).mockReturnValueOnce(refreshed.promise);
    const view = render(<EditDiaryPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Load counselor options" }));
    const adaBox = await screen.findByRole("checkbox", { name: "Ada Counselor" }) as HTMLInputElement;
    fireEvent.click(adaBox); fireEvent.click(screen.getByRole("checkbox", { name: "Ben Counselor" }));
    fireEvent.change(screen.getByPlaceholderText("Begin wherever you are…"), { target: { value: "Unsaved draft" } });
    fireEvent.change(screen.getByLabelText("Primary emotion"), { target: { value: "75c75a98-c53d-41ed-b35a-7c4e87801ce0" } });
    fireEvent.change(screen.getByLabelText("Intensity before"), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText("Intensity after"), { target: { value: "7" } });
    mocks.token = "new-token"; view.rerender(<EditDiaryPage />);
    await waitFor(() => expect(mocks.shares).toHaveBeenCalledWith("new-token", "a"));
    expect((screen.getByRole("button", { name: "Save changes" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByPlaceholderText("Begin wherever you are…") as HTMLTextAreaElement).value).toBe("Unsaved draft");
    await act(async () => refreshed.resolve({ shareVersion: "v2", recipients: [] }));
    expect(await screen.findByText(/Sharing changed while you were editing/)).toBeTruthy();
    expect((screen.getByRole("checkbox", { name: "Ben Counselor" }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText("Primary emotion") as HTMLSelectElement).value).toBe("75c75a98-c53d-41ed-b35a-7c4e87801ce0");
    expect((screen.getByLabelText("Intensity before") as HTMLInputElement).value).toBe("4");
    expect((screen.getByLabelText("Intensity after") as HTMLInputElement).value).toBe("7");
    fireEvent.click(screen.getByRole("button", { name: "Keep my selection and review" }));
    fireEvent.submit(screen.getByRole("button", { name: "Save changes" }).closest("form")!);
    await waitFor(() => expect(mocks.update).toHaveBeenCalledWith("new-token", "a", expect.objectContaining({ content: { text: "Unsaved draft" }, recipientRelationshipIds: ["rel-b"], shareVersion: "v2" })));
    expect(mocks.get).toHaveBeenCalledTimes(1);
  });

  it("blocks saving after a refresh failure without removing the draft and can retry", async () => {
    mocks.get.mockResolvedValue(entry("a"));
    mocks.shares.mockResolvedValueOnce({ shareVersion: "v1", recipients: [ada] }).mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce({ shareVersion: "v1", recipients: [ada] });
    const view = render(<EditDiaryPage />); fireEvent.click(await screen.findByRole("button", { name: "Load counselor options" })); await screen.findByRole("checkbox", { name: "Ada Counselor" });
    fireEvent.change(screen.getByPlaceholderText("Begin wherever you are…"), { target: { value: "Keep this" } });
    mocks.token = "new-token"; view.rerender(<EditDiaryPage />);
    expect((await screen.findByRole("alert")).textContent).toContain("offline");
    expect((screen.getByPlaceholderText("Begin wherever you are…") as HTMLTextAreaElement).value).toBe("Keep this");
    expect((screen.getByRole("button", { name: "Save changes" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Retry sharing information" }));
    await waitFor(() => expect((screen.getByRole("button", { name: "Save changes" }) as HTMLButtonElement).disabled).toBe(false));
    expect((screen.getByPlaceholderText("Begin wherever you are…") as HTMLTextAreaElement).value).toBe("Keep this");
  });

  it("discards the prior account's draft when the authenticated user changes", async () => {
    const nextDiary = deferred<Diary>();
    mocks.get.mockResolvedValueOnce(entry("a")).mockReturnValueOnce(nextDiary.promise);
    mocks.shares.mockResolvedValue({ shareVersion: "v1", recipients: [ada] });
    const view = render(<EditDiaryPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Load counselor options" }));
    await screen.findByRole("checkbox", { name: "Ada Counselor" });
    fireEvent.change(screen.getByPlaceholderText("Begin wherever you are…"), { target: { value: "Previous account draft" } });
    mocks.userId = "another-owner"; mocks.token = "other-token"; view.rerender(<EditDiaryPage />);
    expect(screen.queryByDisplayValue("Previous account draft")).toBeNull();
    await act(async () => nextDiary.resolve(entry("a")));
    expect(await screen.findByDisplayValue("Diary a")).toBeTruthy();
  });
});
