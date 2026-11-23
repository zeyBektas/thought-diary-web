"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";

import { useAuth } from "./auth-provider";
import type { RoleCode } from "@/types/api";

export function ProtectedRoute({ children, allowedRole }: { children: ReactNode; allowedRole?: RoleCode }) {
  const { isAuthenticated, isLoading, session } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const unauthorized = Boolean(isAuthenticated && allowedRole && session?.user.role.code !== allowedRole);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace(`/login?redirect=${encodeURIComponent(pathname)}`);
    } else if (!isLoading && unauthorized) {
      router.replace("/dashboard");
    }
  }, [isAuthenticated, isLoading, pathname, router, unauthorized]);

  if (isLoading || !isAuthenticated || unauthorized) {
    return (
      <main className="flex min-h-screen items-center justify-center px-6">
        <p className="text-sm text-muted-foreground">Checking your session…</p>
      </main>
    );
  }

  return children;
}
