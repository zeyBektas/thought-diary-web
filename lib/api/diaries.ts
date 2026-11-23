import type { CreateDiaryInput, Diary, DiarySharingState, UpdateDiaryInput } from "@/types/api";
import { authenticatedFetch } from "./authenticated";

export function listDiaries(accessToken: string) {
  return authenticatedFetch<Diary[]>("/diaries", { accessToken });
}

export function getDiary(accessToken: string, id: string) {
  return authenticatedFetch<Diary>(`/diaries/${id}`, { accessToken });
}

export function createDiary(accessToken: string, input: CreateDiaryInput) {
  return authenticatedFetch<Diary>("/diaries", {
    method: "POST",
    accessToken,
    body: input,
  });
}

export function updateDiary(
  accessToken: string,
  id: string,
  input: UpdateDiaryInput,
) {
  return authenticatedFetch<Diary>(`/diaries/${encodeURIComponent(id)}`, {
    method: "PATCH",
    accessToken,
    body: input,
  });
}

export function getDiaryShares(accessToken: string, id: string) {
  return authenticatedFetch<DiarySharingState>(`/diaries/${encodeURIComponent(id)}/shares`, {
    accessToken,
  });
}

export function replaceDiaryShares(
  accessToken: string,
  id: string,
  recipientRelationshipIds: string[],
  shareVersion: string,
) {
  return authenticatedFetch<DiarySharingState>(`/diaries/${encodeURIComponent(id)}/shares`, {
    method: "PUT",
    accessToken,
    body: { recipientRelationshipIds, shareVersion },
  });
}

export function deleteDiary(accessToken: string, id: string) {
  return authenticatedFetch<{ message: string }>(`/diaries/${id}`, {
    method: "DELETE",
    accessToken,
  });
}
