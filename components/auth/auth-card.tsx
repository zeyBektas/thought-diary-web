import Link from "next/link";
import type { ReactNode } from "react";

export function AuthCard({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 py-12 text-foreground">
      <div className="w-full max-w-md space-y-8">
        <div className="space-y-3 text-center">
          <Link
            href="/"
            className="text-sm font-medium uppercase tracking-[0.2em] text-muted-foreground"
          >
            Thought Diary
          </Link>
          <div className="space-y-2">
            <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
            <p className="text-sm leading-6 text-muted-foreground">{description}</p>
          </div>
        </div>

        <section className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
          {children}
        </section>

        <p className="text-center text-sm text-muted-foreground">{footer}</p>
      </div>
    </main>
  );
}
