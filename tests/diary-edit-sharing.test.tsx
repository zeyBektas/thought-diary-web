import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ApiError } from "@/lib/api/client";
import { DiaryForm } from "@/components/diary/diary-form";
import type { Diary, DiarySharingState } from "@/types/api";

const mocks = vi.hoisted(() => ({ lookup: vi.fn(), shares: vi.fn(), submit: vi.fn() }));
vi.mock("@/lib/api/relationships", () => ({ listShareableCounselors: mocks.lookup }));
vi.mock("@/lib/api/diaries", () => ({ getDiaryShares: mocks.shares }));
const recipients = [
  { relationshipId: "rel-a", counselor: { id: "user-a", firstName: "Ada", lastName: "Counselor", username: null } },
  { relationshipId: "rel-b", counselor: { id: "user-b", firstName: "Ben", lastName: "Counselor", username: null } },
];
const diary: Diary = { id: "diary", userId: "owner", entryType: "FREE_JOURNAL", primaryEmotionId: null, intensityBefore: null, intensityAfter: null, visibility: "COUNSELOR", content: { text: "Original" }, createdAt: "2026-01-01", updatedAt: "2026-01-01", deletedAt: null };
const sharing: DiarySharingState = { shareVersion: "version-one", recipients: [recipients[0]] };
beforeEach(() => { vi.resetAllMocks(); mocks.lookup.mockResolvedValue({ counselors: recipients }); mocks.shares.mockResolvedValue(sharing); mocks.submit.mockResolvedValue(undefined); });
afterEach(cleanup);
function setup(entry = diary, state = sharing) { return render(<DiaryForm diary={entry} initialSharing={state} sharingAccessToken="token" emotions={[]} isSubmitting={false} submitLabel="Save changes" onSubmit={mocks.submit} />); }
function save() { fireEvent.submit(screen.getByRole("button", { name: "Save changes" }).closest("form")!); }
function visibility(value: string) { fireEvent.change(screen.getByLabelText("Visibility"), { target: { value } }); }
async function choices() {
  const load = screen.queryByRole("button", { name: "Load counselor options" });
  if (load) fireEvent.click(load);
  return await screen.findByRole("checkbox", { name: "Ada Counselor" }) as HTMLInputElement;
}

describe("editing diary sharing", () => {
  it("initializes only granted recipients and omits sharing and visibility for content-only edits", async () => {
    setup(); const ada = await choices(); expect(ada.checked).toBe(true); expect((screen.getByRole("checkbox", { name: "Ben Counselor" }) as HTMLInputElement).checked).toBe(false);
    save(); await waitFor(() => expect(mocks.submit).toHaveBeenCalledTimes(1));
    expect(mocks.submit.mock.calls[0][0]).not.toHaveProperty("visibility"); expect(mocks.submit.mock.calls[0][0]).not.toHaveProperty("recipientRelationshipIds"); expect(mocks.submit.mock.calls[0][0]).not.toHaveProperty("shareVersion");
  });
  it("replaces recipients atomically using the original version", async () => {
    setup(); fireEvent.click(await choices()); fireEvent.click(screen.getByRole("checkbox", { name: "Ben Counselor" })); save();
    await waitFor(() => expect(mocks.submit).toHaveBeenCalledTimes(1)); expect(mocks.submit.mock.calls[0][0]).toMatchObject({ recipientRelationshipIds: ["rel-b"], shareVersion: "version-one" });
  });
  it("sends an empty set and version when changing to private", async () => {
    setup(); await choices(); visibility("PRIVATE"); expect(screen.getByText(/Saving privately removes/)).toBeTruthy(); save();
    await waitFor(() => expect(mocks.submit).toHaveBeenCalledTimes(1)); expect(mocks.submit.mock.calls[0][0]).toMatchObject({ visibility: "PRIVATE", recipientRelationshipIds: [], shareVersion: "version-one" });
  });
  it.each([false, true])("supports private to counselor with selected=%s", async (select) => {
    setup({ ...diary, visibility: "PRIVATE" }, { shareVersion: "private-version", recipients: [] }); visibility("COUNSELOR"); const ada = await choices(); if (select) fireEvent.click(ada); save();
    await waitFor(() => expect(mocks.submit).toHaveBeenCalledTimes(1)); expect(mocks.submit.mock.calls[0][0]).toMatchObject({ visibility: "COUNSELOR", recipientRelationshipIds: select ? ["rel-a"] : [], shareVersion: "private-version" });
  });
  it("leaves a shared entry with no recipients unshared", async () => {
    setup(diary, { shareVersion: "empty", recipients: [] }); expect((await choices()).checked).toBe(false); save(); await waitFor(() => expect(mocks.submit).toHaveBeenCalledTimes(1)); expect(mocks.submit.mock.calls[0][0]).not.toHaveProperty("recipientRelationshipIds");
  });
  it.each([409, 400])("preserves draft on %s and requires explicit refresh and review", async (status) => {
    mocks.submit.mockRejectedValueOnce(new ApiError("failure", status)); mocks.shares.mockResolvedValue({ shareVersion: "new-version", recipients: [recipients[1]] });
    setup(); fireEvent.click(await choices()); fireEvent.change(screen.getByPlaceholderText("Begin wherever you are…"), { target: { value: "Unsaved draft" } }); save();
    expect(await screen.findByText(/Your unsaved changes and attempted selection are preserved/)).toBeTruthy(); expect(mocks.submit).toHaveBeenCalledTimes(1); expect((screen.getByPlaceholderText("Begin wherever you are…") as HTMLTextAreaElement).value).toBe("Unsaved draft");
    fireEvent.click(screen.getByRole("button", { name: "Reload sharing and eligible counselors" })); await screen.findByText(/Current recipients: Ben Counselor/); expect((screen.getByRole("button", { name: "Save changes" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Use current recipients and review" })); expect((screen.getByRole("checkbox", { name: "Ben Counselor" }) as HTMLInputElement).checked).toBe(true); expect(mocks.submit).toHaveBeenCalledTimes(1);
  });
  it("blocks replacement on counselor lookup failure and prevents duplicate saves", async () => {
    mocks.lookup.mockRejectedValueOnce(new Error("unavailable")); setup(); fireEvent.click(screen.getByRole("button", { name: "Load counselor options" })); expect(await screen.findByText(/Could not load eligible counselors/)).toBeTruthy(); save(); expect(mocks.submit).toHaveBeenCalledTimes(1);
    mocks.lookup.mockResolvedValueOnce({ counselors: recipients }); fireEvent.click(screen.getByRole("button", { name: "Retry counselor lookup" })); await choices(); fireEvent.click(screen.getByRole("checkbox", { name: "Ben Counselor" }));
    let resolve!: () => void; mocks.submit.mockReturnValue(new Promise<void>((done) => { resolve = done; })); save(); save(); expect(mocks.submit).toHaveBeenCalledTimes(2); await act(async () => resolve());
  });
  it("preserves the draft when a recovery refresh fails", async () => {
    mocks.submit.mockRejectedValueOnce(new ApiError("conflict", 409)); mocks.shares.mockRejectedValueOnce(new Error("refresh unavailable"));
    setup(); fireEvent.click(await choices()); fireEvent.change(screen.getByPlaceholderText("Begin wherever you are…"), { target: { value: "Draft remains" } }); save();
    await screen.findByText(/Your unsaved changes and attempted selection are preserved/); fireEvent.click(screen.getByRole("button", { name: "Reload sharing and eligible counselors" }));
    expect(await screen.findByText("refresh unavailable")).toBeTruthy(); expect((screen.getByPlaceholderText("Begin wherever you are…") as HTMLTextAreaElement).value).toBe("Draft remains"); expect((screen.getByRole("button", { name: "Save changes" }) as HTMLButtonElement).disabled).toBe(true);
  });
  it("ignores a counselor lookup after unmount", async () => {
    let resolve!: (value: { counselors: typeof recipients }) => void; mocks.lookup.mockReturnValue(new Promise((done) => { resolve = done; }));
    const view = setup(); fireEvent.click(screen.getByRole("button", { name: "Load counselor options" })); await waitFor(() => expect(mocks.lookup).toHaveBeenCalledTimes(1)); view.unmount(); await act(async () => resolve({ counselors: recipients })); expect(screen.queryByText("Ada Counselor")).toBeNull();
  });

  it("allows a content-only save when counselor lookup fails", async () => {
    mocks.lookup.mockRejectedValueOnce(new Error("unavailable")); setup(); fireEvent.click(screen.getByRole("button", { name: "Load counselor options" }));
    expect(await screen.findByText(/Could not load eligible counselors/)).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText("Begin wherever you are…"), { target: { value: "Content only" } });
    fireEvent.submit(screen.getByRole("button", { name: "Save changes" }).closest("form")!);
    await waitFor(() => expect(mocks.submit).toHaveBeenCalledTimes(1));
    expect(mocks.submit.mock.calls[0][0]).toMatchObject({ entryType: "FREE_JOURNAL", content: { text: "Content only" }, primaryEmotionId: null });
    expect(mocks.submit.mock.calls[0][0]).not.toHaveProperty("visibility");
    expect(mocks.submit.mock.calls[0][0]).not.toHaveProperty("recipientRelationshipIds");
    expect(mocks.submit.mock.calls[0][0]).not.toHaveProperty("shareVersion");
    expect(mocks.lookup).toHaveBeenCalledTimes(1);
  });

  it("loads sharing options on entry and retries an intentional recipient change", async () => {
    mocks.lookup.mockRejectedValueOnce(new Error("unavailable")).mockResolvedValueOnce({ counselors: recipients }); setup();
    fireEvent.click(screen.getByRole("button", { name: "Load counselor options" }));
    expect(await screen.findByText(/Could not load eligible counselors/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry counselor lookup" }));
    const ada = await screen.findByRole("checkbox", { name: "Ada Counselor" }) as HTMLInputElement;
    fireEvent.click(ada); fireEvent.submit(screen.getByRole("button", { name: "Save changes" }).closest("form")!);
    await waitFor(() => expect(mocks.submit).toHaveBeenCalledTimes(1));
    expect(mocks.submit.mock.calls[0][0]).toMatchObject({ recipientRelationshipIds: [], shareVersion: "version-one" });
  });
});
