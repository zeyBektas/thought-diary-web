import type { Emotion } from "@/types/api";
import { authenticatedFetch } from "./authenticated";

export function listEmotions(accessToken: string) {
  return authenticatedFetch<Emotion[]>("/emotions", { accessToken });
}
