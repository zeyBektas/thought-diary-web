"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { useAuth } from "@/components/auth/auth-provider";
import { ProtectedRoute } from "@/components/auth/protected-route";
import { DiaryCard } from "@/components/diary/diary-card";
import { DiaryError, DiaryLoading } from "@/components/diary/diary-loading";
import { DiaryLayout } from "@/components/diary/diary-layout";
import { ClientRelationships } from "@/components/relationships/client-relationships";
import { listDiaries } from "@/lib/api/diaries";
import { listEmotions } from "@/lib/api/emotions";
import { getErrorMessage } from "@/lib/forms";
import type { Diary, Emotion } from "@/types/api";

function DashboardContent() {
  const { session } = useAuth();
  const [diaries, setDiaries] = useState<Diary[]>([]);
  const [emotions, setEmotions] = useState<Emotion[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session?.accessToken) return;

    let active = true;

    Promise.all([listDiaries(session.accessToken), listEmotions(session.accessToken)])
      .then(([diaryResponse, emotionResponse]) => {
        if (!active) return;
        setDiaries(diaryResponse);
        setEmotions(emotionResponse);
      })
      .catch((requestError: unknown) => {
        if (active) setError(getErrorMessage(requestError));
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [session?.accessToken]);

  return (
    <DiaryLayout>
      <main className="mx-auto max-w-6xl px-6 py-10 sm:py-14">
        <section className="rounded-3xl border border-border bg-card p-7 shadow-sm sm:p-10">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-muted-foreground">
            Your reflection space
          </p>
          <div className="mt-4 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
            <div className="max-w-2xl space-y-3">
              <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                Welcome back, {session?.user.firstName}.
              </h1>
              <p className="leading-7 text-muted-foreground">
                Take a moment to notice what is present for you today.
              </p>
            </div>
            <Link
              href="/diaries/new"
              className="inline-flex shrink-0 items-center justify-center rounded-lg bg-foreground px-4 py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
            >
              Write a diary entry
            </Link>
          </div>
        </section>

        {session?.user.role.code === "CLIENT" ? <ClientRelationships /> : null}

        <section className="mt-10 space-y-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold tracking-tight">Recent entries</h2>
              <p className="mt-1 text-sm text-muted-foreground">Your latest reflections, newest first.</p>
            </div>
            <Link href="/diaries" className="text-sm font-medium underline underline-offset-4">
              View history
            </Link>
          </div>

          {isLoading ? <DiaryLoading /> : null}
          {!isLoading && error ? <DiaryError message={error} /> : null}
          {!isLoading && !error && diaries.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border px-6 py-12 text-center">
              <p className="font-medium">No entries yet</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Your first entry can be as simple as a few honest sentences.
              </p>
              <Link href="/diaries/new" className="mt-4 inline-block text-sm font-medium underline underline-offset-4">
                Write your first entry
              </Link>
            </div>
          ) : null}
          {!isLoading && !error && diaries.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2">
              {diaries.slice(0, 5).map((diary) => (
                <DiaryCard key={diary.id} diary={diary} emotions={emotions} />
              ))}
            </div>
          ) : null}
        </section>
      </main>
    </DiaryLayout>
  );
}

export default function DashboardPage() {
  return (
    <ProtectedRoute>
      <DashboardContent />
    </ProtectedRoute>
  );
}
