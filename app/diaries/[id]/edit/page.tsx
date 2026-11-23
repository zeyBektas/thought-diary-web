"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { useAuth } from "@/components/auth/auth-provider";
import { ProtectedRoute } from "@/components/auth/protected-route";
import { DiaryForm } from "@/components/diary/diary-form";
import { DiaryError, DiaryLoading } from "@/components/diary/diary-loading";
import { DiaryPage } from "@/components/diary/diary-page";
import { Button } from "@/components/ui/button";
import { getDiary, getDiaryShares, updateDiary } from "@/lib/api/diaries";
import { listEmotions } from "@/lib/api/emotions";
import { ApiError } from "@/lib/api/client";
import { getErrorMessage } from "@/lib/forms";
import type { CreateDiaryInput, Diary, DiarySharingState, Emotion, UpdateDiaryInput } from "@/types/api";

function EditDiaryContent() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const { session } = useAuth();
  const accessToken = session?.accessToken;
  const [initialToken] = useState(accessToken);
  const [diary, setDiary] = useState<Diary | null>(null);
  const [emotions, setEmotions] = useState<Emotion[]>([]);
  const [sharing, setSharing] = useState<DiarySharingState | null>(null);
  const [sharingToken, setSharingToken] = useState<string | undefined>();
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);
  const [shareLoading, setShareLoading] = useState(true);
  const shareRequestVersion = useRef(0);

  const loadSharing = useCallback(async () => {
    if (!accessToken || !params.id) return;
    const version = ++shareRequestVersion.current;
    setShareLoading(true);
    setShareError(null);
    try {
      const response = await getDiaryShares(accessToken, params.id);
      if (version === shareRequestVersion.current) { setSharing(response); setSharingToken(accessToken); }
    } catch (requestError) {
      if (version === shareRequestVersion.current) setShareError(getErrorMessage(requestError));
    } finally {
      if (version === shareRequestVersion.current) setShareLoading(false);
    }
  }, [params.id, accessToken]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadSharing(), 0);
    return () => { window.clearTimeout(timer); shareRequestVersion.current += 1; };
  }, [loadSharing]);

  useEffect(() => {
    const token = initialToken;
    if (!token || !params.id) return;

    let active = true;
    Promise.all([getDiary(token, params.id), listEmotions(token)])
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
  }, [params.id, initialToken]);

  async function handleSubmit(input: CreateDiaryInput | UpdateDiaryInput) {
    if (!session?.accessToken || !diary) return;
    setIsSubmitting(true);
    try {
      await updateDiary(session.accessToken, diary.id, input as UpdateDiaryInput);
      router.replace(`/diaries/${diary.id}`);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <DiaryPage
      title="Edit diary entry"
      description="Make any changes you need, then save when it feels right."
      actions={
        <Link href={diary ? `/diaries/${diary.id}` : "/diaries"}>
          <Button type="button" className="bg-card text-foreground ring-1 ring-border hover:bg-background">
            Cancel
          </Button>
        </Link>
      }
    >
      {isLoading || (!error && !sharing && shareLoading) ? <DiaryLoading /> : null}
      {!isLoading && error ? <DiaryError message={error} /> : null}
      {!isLoading && !error && !shareLoading && shareError ? (
        <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-6 py-5 text-sm text-red-800">
          <p>Could not load sharing information: {shareError}</p>
          <button type="button" className="mt-2 font-medium underline" onClick={() => void loadSharing()}>Retry sharing information</button>
        </div>
      ) : null}
      {!isLoading && !error && diary && sharing ? (
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
          <DiaryForm
            diary={diary}
            initialSharing={sharing}
            sharingBlocked={shareLoading || Boolean(shareError) || sharingToken !== accessToken}
            sharingAccessToken={session?.accessToken}
            emotions={emotions}
            isSubmitting={isSubmitting}
            submitLabel="Save changes"
            onSubmit={handleSubmit}
          />
        </div>
      ) : null}
    </DiaryPage>
  );
}

export default function EditDiaryPage() {
  const { id } = useParams<{ id: string }>();
  const { session } = useAuth();
  return (
    <ProtectedRoute>
      <EditDiaryContent key={`${id}:${session?.user.id ?? ""}`} />
    </ProtectedRoute>
  );
}
