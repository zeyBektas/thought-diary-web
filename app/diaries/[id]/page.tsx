"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { useAuth } from "@/components/auth/auth-provider";
import { ProtectedRoute } from "@/components/auth/protected-route";
import { DiaryError, DiaryLoading } from "@/components/diary/diary-loading";
import { DiaryPage } from "@/components/diary/diary-page";
import { Button } from "@/components/ui/button";
import { deleteDiary, getDiary } from "@/lib/api/diaries";
import { listEmotions } from "@/lib/api/emotions";
import { formatEmotionCode, formatEntryType, getDiaryText } from "@/lib/diary-content";
import { getErrorMessage } from "@/lib/forms";
import { ApiError } from "@/lib/api/client";
import type { Diary, Emotion } from "@/types/api";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "full",
    timeStyle: "short",
  }).format(new Date(value));
}

function DiaryDetailContent() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const { session } = useAuth();
  const [diary, setDiary] = useState<Diary | null>(null);
  const [emotions, setEmotions] = useState<Emotion[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session?.accessToken || !params.id) return;

    let active = true;
    Promise.all([getDiary(session.accessToken, params.id), listEmotions(session.accessToken)])
      .then(([diaryResponse, emotionResponse]) => {
        if (!active) return;
        setDiary(diaryResponse);
        setEmotions(emotionResponse);
      })
      .catch((requestError: unknown) => {
        if (!active) return;
        setError(
          requestError instanceof ApiError && requestError.status === 404
            ? "This diary entry could not be found."
            : getErrorMessage(requestError),
        );
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [params.id, session?.accessToken]);

  async function handleDelete() {
    if (!session?.accessToken || !diary) return;
    if (!window.confirm("Delete this diary entry? This cannot be undone.")) return;

    setIsDeleting(true);
    setError(null);
    try {
      await deleteDiary(session.accessToken, diary.id);
      router.replace("/diaries");
    } catch (requestError) {
      setError(getErrorMessage(requestError));
      setIsDeleting(false);
    }
  }

  const emotion = diary ? emotions.find((item) => item.id === diary.primaryEmotionId) : undefined;
  const textContent = diary ? getDiaryText(diary.content) : null;

  return (
    <DiaryPage
      title={diary ? formatEntryType(diary.entryType) : "Diary entry"}
      description={diary ? formatDate(diary.createdAt) : undefined}
      actions={
        diary ? (
          <>
            <Link href={`/diaries/${diary.id}/edit`}>
              <Button type="button" className="bg-card text-foreground ring-1 ring-border hover:bg-background">
                Edit
              </Button>
            </Link>
            <Button type="button" onClick={() => void handleDelete()} disabled={isDeleting} className="bg-red-700 hover:bg-red-800">
              {isDeleting ? "Deleting…" : "Delete"}
            </Button>
          </>
        ) : null
      }
    >
      {isLoading ? <DiaryLoading /> : null}
      {!isLoading && error ? <DiaryError message={error} /> : null}
      {!isLoading && !error && diary ? (
        <article className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span className="rounded-full bg-background px-2.5 py-1">{diary.visibility}</span>
            {emotion ? (
              <span className="rounded-full bg-background px-2.5 py-1">
                {formatEmotionCode(emotion.code)}
              </span>
            ) : null}
            {diary.intensityBefore !== null || diary.intensityAfter !== null ? (
              <span className="rounded-full bg-background px-2.5 py-1">
                Intensity {diary.intensityBefore ?? "—"} → {diary.intensityAfter ?? "—"}
              </span>
            ) : null}
          </div>

          <div className="mt-8">
            {textContent !== null ? (
              <p className="whitespace-pre-wrap text-base leading-8">{textContent}</p>
            ) : (
              <pre className="overflow-x-auto rounded-xl bg-background p-4 text-sm leading-6 text-muted-foreground">
                {JSON.stringify(diary.content, null, 2)}
              </pre>
            )}
          </div>
        </article>
      ) : null}
    </DiaryPage>
  );
}

export default function DiaryDetailPage() {
  return (
    <ProtectedRoute>
      <DiaryDetailContent />
    </ProtectedRoute>
  );
}
