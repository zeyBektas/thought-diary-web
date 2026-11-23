import Link from "next/link";

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:5001";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-background px-6 py-16 text-foreground">
      <div className="mx-auto flex max-w-3xl flex-col gap-10">
        <section className="space-y-4">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-muted-foreground">
            Thought Diary Web
          </p>
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
            A thoughtful frontend foundation is ready.
          </h1>
          <p className="max-w-2xl text-lg leading-8 text-muted-foreground">
            The Next.js App Router is connected to a typed API layer and ready
            for the diary experience.
          </p>
          <div className="flex flex-wrap gap-3 pt-2">
            <Link
              href="/login"
              className="rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90"
            >
              Sign in
            </Link>
            <Link
              href="/register"
              className="rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium transition-colors hover:bg-muted-foreground/10"
            >
              Create an account
            </Link>
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <p className="text-sm font-medium text-muted-foreground">Backend API</p>
          <p className="mt-2 break-all font-mono text-sm">{apiBaseUrl}</p>
          <p className="mt-4 text-sm text-muted-foreground">
            Authentication and diary screens will be added in a later step.
          </p>
        </section>
      </div>
    </main>
  );
}
