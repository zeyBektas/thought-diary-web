"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { ProtectedRoute } from "@/components/auth/protected-route";
import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api/client";
import { listCounselorDiaries } from "@/lib/api/counselor-diaries";
import { formatEmotionCode, formatEntryType, getDiaryText } from "@/lib/diary-content";
import { getErrorMessage } from "@/lib/forms";
import type { CounselorDiary } from "@/types/api";

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(undefined, { dateStyle: "medium" });
}

function EntryCard({ entry }: { entry: CounselorDiary }) {
  const preview = getDiaryText(entry.content) ?? "This entry contains structured content.";
  const clientName = [entry.client.firstName, entry.client.lastName].filter(Boolean).join(" ");
  return (
    <Link href={`/counselor/diaries/${entry.id}`} className="block rounded-2xl border border-border bg-card p-5 shadow-sm transition-colors hover:bg-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{formatEntryType(entry.entryType)}</span>
        <time dateTime={entry.createdAt}>{formatDate(entry.createdAt)}</time>
      </div>
      <p className="mt-2 text-sm font-medium">{clientName || "Client"}</p>
      <p className="mt-3 line-clamp-3 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{preview}</p>
      {entry.primaryEmotion ? <span className="mt-4 inline-block rounded-full bg-background px-2.5 py-1 text-xs text-muted-foreground">{formatEmotionCode(entry.primaryEmotion.code)}</span> : null}
    </Link>
  );
}

function CounselorDiariesContent() {
  const { session } = useAuth();
  const accessToken = session?.accessToken;
  const [entries, setEntries] = useState<CounselorDiary[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [moreError, setMoreError] = useState<string | null>(null);
  const requestVersion = useRef(0);
  const loadingMoreRef = useRef(false);

  const loadFirst = useCallback(async () => {
    if (!accessToken) return;
    const version = ++requestVersion.current;
    setLoading(true); setError(null); setMoreError(null); setEntries([]); setCursor(null);
    loadingMoreRef.current = false; setLoadingMore(false);
    try {
      const page = await listCounselorDiaries(accessToken);
      if (version === requestVersion.current) { setEntries(page.entries); setCursor(page.nextCursor); }
    } catch (requestError) {
      if (version === requestVersion.current) setError(requestError instanceof ApiError && requestError.status === 403 ? "Your counselor access is no longer active." : getErrorMessage(requestError));
    } finally { if (version === requestVersion.current) setLoading(false); }
  }, [accessToken]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadFirst(); }, 0);
    return () => { window.clearTimeout(timer); requestVersion.current += 1; };
  }, [loadFirst]);

  async function loadMore() {
    if (!accessToken || !cursor || loadingMoreRef.current) return;
    const version = requestVersion.current;
    loadingMoreRef.current = true; setLoadingMore(true); setMoreError(null);
    try {
      const page = await listCounselorDiaries(accessToken, { cursor });
      if (version === requestVersion.current) { setEntries((current) => [...current, ...page.entries]); setCursor(page.nextCursor); }
    } catch (requestError) {
      if (version === requestVersion.current) setMoreError(requestError instanceof ApiError && requestError.status === 403 ? "Your counselor access is no longer active." : getErrorMessage(requestError));
    } finally { loadingMoreRef.current = false; if (version === requestVersion.current) setLoadingMore(false); }
  }

  return <div className="min-h-screen bg-background text-foreground"><header className="border-b border-border bg-card"><div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4"><Link href="/counselor/dashboard" className="font-semibold tracking-tight">Thought Diary</Link><Link href="/counselor/dashboard" className="text-sm text-muted-foreground hover:text-foreground">Relationships</Link></div></header><main className="mx-auto max-w-6xl px-6 py-10 sm:py-14"><div className="flex flex-col gap-2"><h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Shared diaries</h1><p className="text-muted-foreground">Entries your active clients have explicitly shared with you.</p></div>{loading ? <p className="mt-8 text-sm text-muted-foreground">Loading shared diaries…</p> : null}{!loading && error ? <div className="mt-8 rounded-2xl border border-red-200 bg-red-50 px-6 py-5 text-sm text-red-800" role="alert"><p>{error}</p><button type="button" className="mt-2 font-medium underline" onClick={() => void loadFirst()}>Try again</button></div> : null}{!loading && !error && entries.length === 0 ? <p className="mt-8 rounded-2xl border border-dashed border-border px-6 py-12 text-center text-sm text-muted-foreground">No shared diary entries yet.</p> : null}{!loading && !error && entries.length > 0 ? <><div className="mt-8 grid gap-4 md:grid-cols-2">{entries.map((entry) => <EntryCard key={entry.id} entry={entry} />)}</div>{moreError ? <div className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert"><span>{moreError}</span> <button type="button" className="font-medium underline" onClick={() => void loadMore()}>Try again</button></div> : null}{cursor ? <div className="mt-8 flex justify-center"><Button type="button" onClick={() => void loadMore()} disabled={loadingMore}>{loadingMore ? "Loading…" : "Load more"}</Button></div> : <p className="mt-8 text-center text-sm text-muted-foreground">You’ve reached the end.</p>}</> : null}</main></div>;
}

export default function CounselorDiariesPage() { return <ProtectedRoute allowedRole="COUNSELOR"><CounselorDiariesContent /></ProtectedRoute>; }
