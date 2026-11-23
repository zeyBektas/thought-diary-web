import type {
  CareRelationshipStatus,
  Relationship,
  ShareableCounselorsResponse,
} from "@/types/api";
import { authenticatedFetch } from "./authenticated";

export function listShareableCounselors(accessToken: string) {
  return authenticatedFetch<ShareableCounselorsResponse>(
    "/relationships/shareable-counselors",
    { accessToken },
  );
}

export function listRelationships(accessToken: string) {
  return authenticatedFetch<Relationship[]>("/relationships", { accessToken });
}

export function requestRelationship(accessToken: string, clientId: string) {
  return authenticatedFetch<Relationship>("/relationships", {
    method: "POST",
    accessToken,
    body: { clientId },
  });
}

export function respondToRelationship(
  accessToken: string,
  id: string,
  status: Extract<CareRelationshipStatus, "ACTIVE" | "REJECTED">,
) {
  return authenticatedFetch<Relationship>(`/relationships/${id}`, {
    method: "PATCH",
    accessToken,
    body: { status },
  });
}

export function revokeRelationship(accessToken: string, id: string) {
  return authenticatedFetch<Relationship>(`/relationships/${id}/revoke`, {
    method: "PATCH",
    accessToken,
  });
}
