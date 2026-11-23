export function DiaryLoading({ label = "Loading your diary…" }: { label?: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border px-6 py-12 text-center text-sm text-muted-foreground">
      {label}
    </div>
  );
}

export function DiaryError({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-red-200 bg-red-50 px-6 py-5 text-sm text-red-800" role="alert">
      {message}
    </div>
  );
}
