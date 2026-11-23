"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

import { AuthCard } from "@/components/auth/auth-card";
import { FormField } from "@/components/auth/form-field";
import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { register } from "@/lib/api/auth";
import { getErrorMessage, getFieldErrors } from "@/lib/forms";
import { registerSchema, type RegisterValues } from "@/schemas/auth";

const initialValues: RegisterValues = {
  email: "",
  password: "",
  firstName: "",
  lastName: "",
  username: "",
  phone: "",
};

function RegisterForm() {
  const router = useRouter();
  const { signIn } = useAuth();
  const [values, setValues] = useState<RegisterValues>(initialValues);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<string, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function updateField(field: keyof RegisterValues, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
    setFormError(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const parsed = registerSchema.safeParse(values);
    if (!parsed.success) {
      setFieldErrors(getFieldErrors(parsed.error));
      return;
    }

    setFieldErrors({});
    setIsSubmitting(true);

    try {
      const response = await register(parsed.data);
      signIn(response);
      router.replace("/dashboard");
    } catch (error) {
      setFormError(getErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthCard
      title="Create your account"
      description="Start a private space for noticing and understanding your thoughts."
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-foreground underline underline-offset-4">
            Sign in
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

        <div className="grid gap-5 sm:grid-cols-2">
          <FormField
            id="firstName"
            name="firstName"
            label="First name"
            autoComplete="given-name"
            value={values.firstName}
            onChange={(event) => updateField("firstName", event.target.value)}
            error={fieldErrors.firstName}
          />
          <FormField
            id="lastName"
            name="lastName"
            label="Last name"
            autoComplete="family-name"
            value={values.lastName}
            onChange={(event) => updateField("lastName", event.target.value)}
            error={fieldErrors.lastName}
          />
        </div>
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
          autoComplete="new-password"
          value={values.password}
          onChange={(event) => updateField("password", event.target.value)}
          error={fieldErrors.password}
        />
        <FormField
          id="username"
          name="username"
          label="Username (optional)"
          autoComplete="username"
          value={values.username}
          onChange={(event) => updateField("username", event.target.value)}
          error={fieldErrors.username}
        />
        <FormField
          id="phone"
          name="phone"
          type="tel"
          label="Phone (optional)"
          autoComplete="tel"
          value={values.phone}
          onChange={(event) => updateField("phone", event.target.value)}
          error={fieldErrors.phone}
        />
        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? "Creating account…" : "Create account"}
        </Button>
      </form>
    </AuthCard>
  );
}

export default function RegisterPage() {
  return <RegisterForm />;
}
