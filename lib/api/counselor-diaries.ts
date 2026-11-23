import type { CounselorDiary, CounselorDiaryPage } from "@/types/api";
import { authenticatedFetch } from "./authenticated";

function withQuery(path: string, query: { limit?: number; cursor?: string }) {
  const params = new URLSearchParams();
  if (query.limit !== undefined) params.set("limit", String(query.limit));
  if (query.cursor !== undefined) params.set("cursor", query.cursor);
  const value = params.toString();
  return value ? `${path}?${value}` : path;
}

export function listCounselorDiaries(
  accessToken: string,
  query: { limit?: number; cursor?: string } = {},
) {
  return authenticatedFetch<CounselorDiaryPage>(withQuery("/counselor/diaries", query), { accessToken });
}

export function getCounselorDiary(accessToken: string, id: string) {
  return authenticatedFetch<CounselorDiary>(`/counselor/diaries/${encodeURIComponent(id)}`, { accessToken });
}
