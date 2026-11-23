"use client";

import Link from "next/link";
import { ReactNode } from "react";

import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";

export function DiaryLayout({ children }: { children: ReactNode }) {
  const { session, signOut } = useAuth();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
          <Link href="/dashboard" className="font-semibold tracking-tight">
            Thought Diary
          </Link>
          <nav className="flex items-center gap-2 text-sm">
            <Link
              href="/diaries"
              className="hidden rounded-md px-3 py-2 text-muted-foreground hover:bg-background hover:text-foreground sm:inline-flex"
            >
              History
            </Link>
            <Link
              href="/diaries/new"
              className="hidden rounded-md px-3 py-2 text-muted-foreground hover:bg-background hover:text-foreground sm:inline-flex"
            >
              New entry
            </Link>
            <span className="hidden text-muted-foreground md:inline">
              {session?.user.firstName}
            </span>
            <Button onClick={() => void signOut()} className="px-3 py-2 text-xs">
              Sign out
            </Button>
          </nav>
        </div>
      </header>
      {children}
    </div>
  );
}
