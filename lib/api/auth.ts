import type {
  AuthResponse,
  CurrentUserResponse,
  LoginInput,
  RegisterInput,
} from "@/types/api";
import { apiFetch } from "./client";
import { authenticatedFetch } from "./authenticated";

export function register(input: RegisterInput) {
  return apiFetch<AuthResponse>("/auth/register", {
    method: "POST",
    body: input,
  });
}

export function login(input: LoginInput) {
  return apiFetch<AuthResponse>("/auth/login", {
    method: "POST",
    body: input,
  });
}

export function refresh(refreshToken: string) {
  return apiFetch<Pick<AuthResponse, "accessToken" | "refreshToken">>(
    "/auth/refresh",
    { method: "POST", body: { refreshToken } },
  );
}

export function logout(refreshToken: string) {
  return apiFetch<{ message: string }>("/auth/logout", {
    method: "POST",
    body: { refreshToken },
  });
}

export function getCurrentUser(accessToken: string) {
  return authenticatedFetch<CurrentUserResponse>("/auth/me", { accessToken });
}
