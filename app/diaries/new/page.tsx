"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { ProtectedRoute } from "@/components/auth/protected-route";
import { useAuth } from "@/components/auth/auth-provider";
import { DiaryForm } from "@/components/diary/diary-form";
import { DiaryError, DiaryLoading } from "@/components/diary/diary-loading";
import { DiaryPage } from "@/components/diary/diary-page";
import { Button } from "@/components/ui/button";
import { createDiary } from "@/lib/api/diaries";
import { listEmotions } from "@/lib/api/emotions";
import { getErrorMessage } from "@/lib/forms";
import type { CreateDiaryInput, Emotion, UpdateDiaryInput } from "@/types/api";

function NewDiaryContent() {
  const router = useRouter();
  const { session } = useAuth();
  const [emotions, setEmotions] = useState<Emotion[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session?.accessToken) return;

    let active = true;
    listEmotions(session.accessToken)
      .then((response) => {
        if (active) setEmotions(response);
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

  async function handleSubmit(input: CreateDiaryInput | UpdateDiaryInput) {
    if (!session?.accessToken) return;
    setIsSubmitting(true);
    try {
      const diary = await createDiary(session.accessToken, input as CreateDiaryInput);
      router.push(`/diaries/${diary.id}`);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <DiaryPage
      title="Write a diary entry"
      description="Give yourself a little space to notice what is here."
      actions={
        <Link href="/diaries">
          <Button type="button" className="bg-card text-foreground ring-1 ring-border hover:bg-background">
            Cancel
          </Button>
        </Link>
      }
    >
      {isLoading ? <DiaryLoading label="Loading emotion options…" /> : null}
      {!isLoading && error ? <DiaryError message={error} /> : null}
      {!isLoading && !error ? (
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
          <DiaryForm
            key={session?.user.id}
            sharingAccessToken={session?.accessToken}
            emotions={emotions}
            isSubmitting={isSubmitting}
            submitLabel="Save entry"
            onSubmit={handleSubmit}
          />
        </div>
      ) : null}
    </DiaryPage>
  );
}

export default function NewDiaryPage() {
  return (
    <ProtectedRoute>
      <NewDiaryContent />
    </ProtectedRoute>
  );
}
