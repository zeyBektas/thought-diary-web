import type { ReactNode } from "react";

import { DiaryLayout } from "./diary-layout";

export function DiaryPage({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <DiaryLayout>
      <main className="mx-auto max-w-6xl px-6 py-10 sm:py-14">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-2">
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
            {description ? <p className="text-muted-foreground">{description}</p> : null}
          </div>
          {actions ? <div className="flex shrink-0 gap-3">{actions}</div> : null}
        </div>
        <div className="mt-8">{children}</div>
      </main>
    </DiaryLayout>
  );
}
