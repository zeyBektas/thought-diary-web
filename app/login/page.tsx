"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useState } from "react";

import { AuthCard } from "@/components/auth/auth-card";
import { FormField } from "@/components/auth/form-field";
import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { login } from "@/lib/api/auth";
import { getErrorMessage, getFieldErrors } from "@/lib/forms";
import { loginSchema, type LoginValues } from "@/schemas/auth";
import type { RoleCode } from "@/types/api";

function getRedirectPath(value: string | null, role: RoleCode) {
  const fallback = role === "COUNSELOR" ? "/counselor/dashboard" : "/dashboard";
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\") || /[\u0000-\u001f\u007f]/.test(value)) return fallback;
  const url = new URL(value, "http://localhost");
  if (url.origin !== "http://localhost") return fallback;
  if (role !== "COUNSELOR" && (url.pathname === "/counselor" || url.pathname.startsWith("/counselor/"))) return fallback;
  return `${url.pathname}${url.search}${url.hash}`;
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { signIn } = useAuth();
  const [values, setValues] = useState<LoginValues>({ email: "", password: "" });
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<string, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function updateField(field: keyof LoginValues, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
    setFormError(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const parsed = loginSchema.safeParse(values);
    if (!parsed.success) {
      setFieldErrors(getFieldErrors(parsed.error));
      return;
    }

    setFieldErrors({});
    setIsSubmitting(true);

    try {
      const response = await login(parsed.data);
      signIn(response);
      router.replace(getRedirectPath(searchParams.get("redirect"), response.user.role.code));
    } catch (error) {
      setFormError(getErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthCard
      title="Welcome back"
      description="Sign in to continue your reflection practice."
      footer={
        <>
          New to Thought Diary?{" "}
          <Link href="/register" className="font-medium text-foreground underline underline-offset-4">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        {formError ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800" role="alert">
            {formError}
          </p>
        ) : null}

        <FormField
          id="email"
          name="email"
          type="email"
          label="Email"
          autoComplete="email"
          value={values.email}
          onChange={(event) => updateField("email", event.target.value)}
          error={fieldErrors.email}
        />
        <FormField
          id="password"
          name="password"
          type="password"
          label="Password"
          autoComplete="current-password"
          value={values.password}
          onChange={(event) => updateField("password", event.target.value)}
          error={fieldErrors.password}
        />
        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </AuthCard>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center px-6">
          <p className="text-sm text-muted-foreground">Loading…</p>
        </main>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
