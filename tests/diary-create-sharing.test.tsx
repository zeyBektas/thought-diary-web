import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { DiaryForm } from "@/components/diary/diary-form";

const mocks = vi.hoisted(() => ({ lookup: vi.fn(), submit: vi.fn() }));
vi.mock("@/lib/api/relationships", () => ({ listShareableCounselors: mocks.lookup }));

const counselors = [
  { relationshipId: "relationship-1", counselor: { id: "user-1", firstName: "Ada", lastName: "Counselor", username: null } },
  { relationshipId: "relationship-2", counselor: { id: "user-2", firstName: "Ben", lastName: "Counselor", username: "ben" } },
];

beforeEach(() => { vi.resetAllMocks(); mocks.lookup.mockResolvedValue({ counselors }); mocks.submit.mockResolvedValue(undefined); });
afterEach(cleanup);

function setup() {
  render(<DiaryForm emotions={[]} isSubmitting={false} submitLabel="Save entry" onSubmit={mocks.submit} sharingAccessToken="token" />);
}
function write() { fireEvent.change(screen.getByPlaceholderText("Begin wherever you are…"), { target: { value: "A diary entry" } }); }
function visibility(value: string) { fireEvent.change(screen.getByLabelText("Visibility"), { target: { value } }); }
function save() { fireEvent.submit(screen.getByRole("button", { name: "Save entry" }).closest("form")!); }

describe("diary creation recipients", () => {
  it("keeps private creation unchanged and validates content", async () => {
    setup(); save(); expect(await screen.findByText("Write something before saving.")).toBeTruthy();
    expect(mocks.submit).not.toHaveBeenCalled(); write(); save();
    await waitFor(() => expect(mocks.submit).toHaveBeenCalledTimes(1));
    expect(mocks.submit.mock.calls[0][0]).toEqual({ entryType: "FREE_JOURNAL", content: { text: "A diary entry" }, visibility: "PRIVATE" });
    expect(mocks.lookup).not.toHaveBeenCalled();
  });

  it("loads counselors without preselection and submits multiple relationship IDs", async () => {
    setup(); write(); visibility("COUNSELOR");
    const ada = await screen.findByRole("checkbox", { name: "Ada Counselor" }) as HTMLInputElement;
    const ben = screen.getByRole("checkbox", { name: "Ben Counselor (@ben)" }) as HTMLInputElement;
    expect(mocks.lookup).toHaveBeenCalledWith("token"); expect(ada.checked).toBe(false); expect(ben.checked).toBe(false);
    fireEvent.click(ada); fireEvent.click(ben); fireEvent.click(ada); expect(ada.checked).toBe(false); fireEvent.click(ada);
    fireEvent.change(screen.getByLabelText("Intensity before"), { target: { value: "4" } }); save();
    await waitFor(() => expect(mocks.submit).toHaveBeenCalledTimes(1));
    expect(mocks.submit.mock.calls[0][0]).toMatchObject({ visibility: "COUNSELOR", intensityBefore: 4, recipientRelationshipIds: ["relationship-2", "relationship-1"] });
  });

  it("preserves selection across visibility changes but omits IDs when private", async () => {
    setup(); write(); visibility("COUNSELOR"); fireEvent.click(await screen.findByRole("checkbox", { name: "Ada Counselor" }));
    visibility("PRIVATE"); expect(screen.queryByRole("checkbox")).toBeNull();
    visibility("COUNSELOR"); expect((screen.getByRole("checkbox", { name: "Ada Counselor" }) as HTMLInputElement).checked).toBe(true);
    expect(mocks.lookup).toHaveBeenCalledTimes(1); visibility("PRIVATE"); save();
    await waitFor(() => expect(mocks.submit).toHaveBeenCalledTimes(1));
    expect(mocks.submit.mock.calls[0][0]).not.toHaveProperty("recipientRelationshipIds");
  });

  it("permits an empty selection including when no eligible counselors exist", async () => {
    mocks.lookup.mockResolvedValue({ counselors: [] }); setup(); write(); visibility("COUNSELOR");
    expect(await screen.findByText(/No active eligible counselors/)).toBeTruthy();
    expect(screen.getByText(/If you select none, no counselor can access it/)).toBeTruthy(); save();
    await waitFor(() => expect(mocks.submit).toHaveBeenCalledTimes(1));
    expect(mocks.submit.mock.calls[0][0]).toMatchObject({ visibility: "COUNSELOR", recipientRelationshipIds: [] });
  });

  it("blocks saving during lookup and after an error until retry succeeds", async () => {
    let reject!: (error: Error) => void;
    mocks.lookup.mockReturnValueOnce(new Promise((_resolve, fail) => { reject = fail; })).mockResolvedValueOnce({ counselors });
    setup(); write(); visibility("COUNSELOR");
    expect((screen.getByRole("button", { name: "Save entry" }) as HTMLButtonElement).disabled).toBe(true); save(); expect(mocks.submit).not.toHaveBeenCalled();
    await act(async () => reject(new Error("Unavailable")));
    expect((await screen.findByRole("alert")).textContent).toContain("Unavailable"); save(); expect(mocks.submit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Retry counselor lookup" })); await screen.findByRole("checkbox", { name: "Ada Counselor" }); save();
    await waitFor(() => expect(mocks.submit).toHaveBeenCalledTimes(1));
    expect(mocks.submit.mock.calls[0][0].recipientRelationshipIds).toEqual([]);
  });

  it("prevents duplicate submissions while a save is pending", async () => {
    let resolve!: () => void; mocks.submit.mockReturnValue(new Promise<void>((done) => { resolve = done; }));
    setup(); write(); save(); save(); expect(mocks.submit).toHaveBeenCalledTimes(1); await act(async () => resolve());
  });
});
