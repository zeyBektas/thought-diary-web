import { describe, expect, it, vi } from "vitest";
const fetchMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/authenticated", () => ({ authenticatedFetch: fetchMock }));
import { getCounselorDiary, listCounselorDiaries } from "@/lib/api/counselor-diaries";
describe("counselor diary API", () => { it("encodes list query and forwards cursor", async () => { fetchMock.mockResolvedValue({ entries: [], nextCursor: null }); await listCounselorDiaries("token", { limit: 20, cursor: "opaque cursor/==" }); expect(fetchMock).toHaveBeenCalledWith("/counselor/diaries?limit=20&cursor=opaque+cursor%2F%3D%3D", { accessToken: "token" }); }); it("uses the detail endpoint", async () => { fetchMock.mockResolvedValue({}); await getCounselorDiary("token", "entry/id"); expect(fetchMock).toHaveBeenCalledWith("/counselor/diaries/entry%2Fid", { accessToken: "token" }); }); });
