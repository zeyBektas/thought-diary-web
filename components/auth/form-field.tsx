import type { InputHTMLAttributes } from "react";

export function FormField({
  label,
  error,
  id,
  ...inputProps
}: InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string;
}) {
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none transition focus:border-foreground focus:ring-2 focus:ring-foreground/10"
        {...inputProps}
      />
      {error ? (
        <p id={`${id}-error`} className="text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
