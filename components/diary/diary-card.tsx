import Link from "next/link";

import { formatEmotionCode, getDiaryText } from "@/lib/diary-content";
import type { Diary, Emotion } from "@/types/api";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatEntryType(value: Diary["entryType"]) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function DiaryCard({ diary, emotions }: { diary: Diary; emotions: Emotion[] }) {
  const emotion = emotions.find((item) => item.id === diary.primaryEmotionId);
  const text = getDiaryText(diary.content);
  const preview = text ?? "This entry contains structured JSON content.";

  return (
    <Link
      href={`/diaries/${diary.id}`}
      className="block rounded-2xl border border-border bg-card p-5 shadow-sm transition-colors hover:bg-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{formatEntryType(diary.entryType)}</span>
        <time dateTime={diary.createdAt}>{formatDate(diary.createdAt)}</time>
      </div>
      <p className="mt-4 line-clamp-3 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
        {preview}
      </p>
      <div className="mt-4 flex flex-wrap gap-2 text-xs text-muted-foreground">
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
    </Link>
  );
}

export { formatDate, formatEntryType };
