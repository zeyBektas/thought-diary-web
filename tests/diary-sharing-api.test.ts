import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CounselorRecipient, DiarySharingState, ShareableCounselorsResponse } from "@/types/api";

const fetchMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/authenticated", () => ({ authenticatedFetch: fetchMock }));

import { createDiary, getDiaryShares, replaceDiaryShares, updateDiary } from "@/lib/api/diaries";
import { listShareableCounselors } from "@/lib/api/relationships";

const recipient: CounselorRecipient = {
  relationshipId: "relationship-one",
  counselor: { id: "counselor-one", firstName: "Ada", lastName: "Counselor", username: null },
};
const state: DiarySharingState = { shareVersion: "opaque-version/+==", recipients: [recipient] };

beforeEach(() => vi.resetAllMocks());

describe("diary sharing API", () => {
  it("gets eligible counselors using the existing authenticated client", async () => {
    const response: ShareableCounselorsResponse = { counselors: [recipient] };
    fetchMock.mockResolvedValue(response);
    expect(await listShareableCounselors("token")).toEqual(response);
    expect(fetchMock).toHaveBeenCalledWith("/relationships/shareable-counselors", { accessToken: "token" });
  });

  it("gets sharing state with a safely encoded journal ID", async () => {
    fetchMock.mockResolvedValue(state);
    expect(await getDiaryShares("token", "entry/id")).toEqual(state);
    expect(fetchMock).toHaveBeenCalledWith("/diaries/entry%2Fid/shares", { accessToken: "token" });
  });

  it("replaces recipients and forwards the opaque version unchanged", async () => {
    fetchMock.mockResolvedValue(state);
    const ids = ["relationship-one", "relationship-two"];
    expect(await replaceDiaryShares("token", "entry/id", ids, state.shareVersion)).toEqual(state);
    expect(fetchMock).toHaveBeenCalledWith("/diaries/entry%2Fid/shares", {
      method: "PUT", accessToken: "token", body: { recipientRelationshipIds: ids, shareVersion: state.shareVersion },
    });
  });

  it("preserves an empty replacement array", async () => {
    fetchMock.mockResolvedValue({ ...state, recipients: [] });
    await replaceDiaryShares("token", "entry", [], state.shareVersion);
    expect(fetchMock).toHaveBeenCalledWith("/diaries/entry/shares", {
      method: "PUT", accessToken: "token", body: { recipientRelationshipIds: [], shareVersion: state.shareVersion },
    });
  });

  it("forwards selected recipients on creation", async () => {
    const input = { entryType: "FREE_JOURNAL" as const, content: { text: "Hello" }, recipientRelationshipIds: ["relationship-one"] };
    await createDiary("token", input);
    expect(fetchMock).toHaveBeenCalledWith("/diaries", { method: "POST", accessToken: "token", body: input });
  });

  it("forwards recipient IDs and version together on PATCH", async () => {
    const input = { content: { text: "Updated" }, recipientRelationshipIds: [], shareVersion: state.shareVersion };
    await updateDiary("token", "entry/id", input);
    expect(fetchMock).toHaveBeenCalledWith("/diaries/entry%2Fid", { method: "PATCH", accessToken: "token", body: input });
  });

  it("keeps ordinary content-only PATCH requests compatible", async () => {
    const input = { content: { text: "Updated" } };
    await updateDiary("token", "entry", input);
    expect(fetchMock).toHaveBeenCalledWith("/diaries/entry", { method: "PATCH", accessToken: "token", body: input });
  });
});
