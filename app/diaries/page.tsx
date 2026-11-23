"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { useAuth } from "@/components/auth/auth-provider";
import { ProtectedRoute } from "@/components/auth/protected-route";
import { DiaryCard } from "@/components/diary/diary-card";
import { DiaryError, DiaryLoading } from "@/components/diary/diary-loading";
import { DiaryPage } from "@/components/diary/diary-page";
import { listDiaries } from "@/lib/api/diaries";
import { listEmotions } from "@/lib/api/emotions";
import { getErrorMessage } from "@/lib/forms";
import type { Diary, Emotion } from "@/types/api";

function DiaryHistoryContent() {
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
    <DiaryPage
      title="Diary history"
      description="A private timeline of the entries you have chosen to keep."
      actions={
        <Link
          href="/diaries/new"
          className="inline-flex items-center justify-center rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90"
        >
          New entry
        </Link>
      }
    >
      {isLoading ? <DiaryLoading /> : null}
      {!isLoading && error ? <DiaryError message={error} /> : null}
      {!isLoading && !error && diaries.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border px-6 py-14 text-center">
          <p className="font-medium">Your history is empty.</p>
          <p className="mt-2 text-sm text-muted-foreground">Your next reflection can start here.</p>
          <Link href="/diaries/new" className="mt-4 inline-block text-sm font-medium underline underline-offset-4">
            Write an entry
          </Link>
        </div>
      ) : null}
      {!isLoading && !error && diaries.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2">
          {diaries.map((diary) => (
            <DiaryCard key={diary.id} diary={diary} emotions={emotions} />
          ))}
        </div>
      ) : null}
    </DiaryPage>
  );
}

export default function DiaryHistoryPage() {
  return (
    <ProtectedRoute>
      <DiaryHistoryContent />
    </ProtectedRoute>
  );
}
