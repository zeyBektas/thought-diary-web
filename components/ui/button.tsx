import * as React from "react";

import { cn } from "@/lib/utils";

export function Button({
  className,
  type = "button",
  ...props
}: React.ComponentProps<"button">) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex items-center justify-center rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground disabled:pointer-events-none disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
