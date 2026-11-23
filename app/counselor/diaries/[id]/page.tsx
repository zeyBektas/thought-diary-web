"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { useAuth } from "@/components/auth/auth-provider";
import { ProtectedRoute } from "@/components/auth/protected-route";
import { ApiError } from "@/lib/api/client";
import { getCounselorDiary } from "@/lib/api/counselor-diaries";
import { formatEmotionCode, formatEntryType, getDiaryText } from "@/lib/diary-content";
import { getErrorMessage } from "@/lib/forms";
import type { CounselorDiary, JsonValue } from "@/types/api";

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en", { dateStyle: "full", timeStyle: "short" }).format(date);
}

function renderContent(content: JsonValue) {
  const text = getDiaryText(content);
  if (text !== null) {
    return <p className="whitespace-pre-wrap text-base leading-8">{text}</p>;
  }

  const serialized = typeof content === "string" ? content : JSON.stringify(content, null, 2);
  return <pre className="overflow-x-auto rounded-xl bg-background p-4 text-sm leading-6 text-muted-foreground">{serialized}</pre>;
}

type DetailError = { message: string; retryable: boolean };

function describeError(requestError: unknown): DetailError {
  if (requestError instanceof ApiError && requestError.status === 404) {
    return { message: "This shared entry is unavailable.", retryable: false };
  }
  if (requestError instanceof ApiError && requestError.status === 403) {
    return { message: "Your counselor access is no longer active.", retryable: false };
  }
  return { message: getErrorMessage(requestError), retryable: true };
}

function CounselorDiaryDetailContent({ entryId }: { entryId: string }) {
  const { session } = useAuth();
  const accessToken = session?.accessToken;
  const [diary, setDiary] = useState<CounselorDiary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<DetailError | null>(null);
  const requestVersion = useRef(0);

  const loadDiary = useCallback(async (version: number) => {
    if (!accessToken || !entryId) return;
    setLoading(true);
    setError(null);
    setDiary(null);
    try {
      const result = await getCounselorDiary(accessToken, entryId);
      if (version === requestVersion.current) setDiary(result);
    } catch (requestError) {
      if (version === requestVersion.current) setError(describeError(requestError));
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }, [accessToken, entryId]);

  useEffect(() => {
    const version = ++requestVersion.current;
    const timer = window.setTimeout(() => { void loadDiary(version); }, 0);
    return () => {
      window.clearTimeout(timer);
      requestVersion.current += 1;
    };
  }, [loadDiary]);

  function retry() {
    const version = ++requestVersion.current;
    void loadDiary(version);
  }

  const clientName = diary ? [diary.client.firstName, diary.client.lastName].filter(Boolean).join(" ") : "Client";

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-6 py-4">
          <Link href="/counselor/dashboard" className="font-semibold tracking-tight">Thought Diary</Link>
          <Link href="/counselor/diaries" className="text-sm text-muted-foreground hover:text-foreground">Shared diaries</Link>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-6 py-10 sm:py-14">
        <Link href="/counselor/diaries" className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground">← Back to shared diaries</Link>
        <div className="mt-8 flex flex-col gap-2">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Shared diary entry</h1>
        </div>

        {loading ? <p className="mt-8 text-sm text-muted-foreground">Loading shared diary entry…</p> : null}
        {!loading && error ? (
          <div className="mt-8 rounded-2xl border border-red-200 bg-red-50 px-6 py-5 text-sm text-red-800" role="alert">
            <p>{error.message}</p>
            {error.retryable ? <button type="button" className="mt-2 font-medium underline" onClick={retry}>Try again</button> : null}
          </div>
        ) : null}
        {!loading && !error && diary ? (
          <article className="mt-8 rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
            <dl className="grid gap-5 border-b border-border pb-6 sm:grid-cols-2">
              <div><dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Client</dt><dd className="mt-1">{clientName}</dd></div>
              <div><dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Entry type</dt><dd className="mt-1">{formatEntryType(diary.entryType)}</dd></div>
              <div><dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Created</dt><dd className="mt-1"><time dateTime={diary.createdAt}>{formatDate(diary.createdAt)}</time></dd></div>
              {diary.primaryEmotion ? <div><dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Primary emotion</dt><dd className="mt-1">{formatEmotionCode(diary.primaryEmotion.code)}</dd></div> : null}
              {diary.intensityBefore !== null ? <div><dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Intensity before</dt><dd className="mt-1">{diary.intensityBefore}</dd></div> : null}
              {diary.intensityAfter !== null ? <div><dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Intensity after</dt><dd className="mt-1">{diary.intensityAfter}</dd></div> : null}
            </dl>
            <div className="mt-8">{renderContent(diary.content)}</div>
          </article>
        ) : null}
      </main>
    </div>
  );
}

export default function CounselorDiaryDetailPage() {
  const { id } = useParams<{ id: string }>();
  return <ProtectedRoute allowedRole="COUNSELOR"><CounselorDiaryDetailContent key={id} entryId={id} /></ProtectedRoute>;
}
