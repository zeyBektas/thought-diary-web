"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";

import { useAuth } from "@/components/auth/auth-provider";
import { FormField } from "@/components/auth/form-field";
import { ProtectedRoute } from "@/components/auth/protected-route";
import { Button } from "@/components/ui/button";
import { listRelationships, requestRelationship } from "@/lib/api/relationships";
import { getErrorMessage } from "@/lib/forms";
import { ApiError } from "@/lib/api/client";
import { relationshipRequestSchema } from "@/schemas/relationship";
import type { CareRelationshipStatus, Relationship } from "@/types/api";

const sections: { status: CareRelationshipStatus; title: string; empty: string }[] = [
  { status: "PENDING", title: "Pending relationships", empty: "No pending requests." },
  { status: "ACTIVE", title: "Active relationships", empty: "No active client relationships." },
  { status: "REJECTED", title: "Rejected relationships", empty: "No rejected requests." },
  { status: "REVOKED", title: "Revoked relationships", empty: "No revoked relationships." },
];

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function RelationshipCard({ relationship, userId }: { relationship: Relationship; userId: string }) {
  const sent = relationship.counselorId === userId;
  const participant = sent ? relationship.client : relationship.counselor;
  const name = [participant.firstName, participant.lastName].filter(Boolean).join(" ");

  return (
    <article className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold">{name || participant.email}</h3>
          <p className="mt-1 break-all text-sm text-muted-foreground">{participant.email}</p>
          <p className="mt-1 text-xs text-muted-foreground">{sent ? "Request sent to client" : "Request involving counselor"}</p>
        </div>
        <span className="rounded-full border border-border px-3 py-1 text-xs font-medium capitalize">{relationship.status.toLowerCase()}</span>
      </div>
      <dl className="mt-4 space-y-1 text-sm text-muted-foreground">
        <div><dt className="inline">Requested: </dt><dd className="inline">{formatDate(relationship.requestedAt)}</dd></div>
        {relationship.respondedAt ? <div><dt className="inline">Responded: </dt><dd className="inline">{formatDate(relationship.respondedAt)}</dd></div> : null}
        {relationship.endedAt ? <div><dt className="inline">Ended: </dt><dd className="inline">{formatDate(relationship.endedAt)}</dd></div> : null}
      </dl>
    </article>
  );
}

function CounselorDashboard() {
  const { session, signOut } = useAuth();
  const [relationships, setRelationships] = useState<Relationship[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [clientId, setClientId] = useState("");
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const requestVersion = useRef(0);
  const accessToken = session?.accessToken;

  const loadRelationships = useCallback(async () => {
    if (!accessToken) return;
    const version = ++requestVersion.current;
    setLoading(true);
    setListError(null);
    try {
      const result = await listRelationships(accessToken);
      if (version === requestVersion.current) setRelationships(result);
    } catch (error) {
      if (version === requestVersion.current) setListError(getErrorMessage(error));
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => void loadRelationships());
    return () => {
      window.cancelAnimationFrame(frame);
      requestVersion.current += 1;
    };
  }, [loadRelationships]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submittingRef.current || !accessToken) return;
    setSuccess(null);
    setFormError(null);
    const parsed = relationshipRequestSchema.safeParse({ clientId });
    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]?.message ?? "Enter a valid client UUID.");
      return;
    }
    setFieldError(undefined);
    submittingRef.current = true;
    setSubmitting(true);
    try {
      await requestRelationship(accessToken, parsed.data.clientId);
      setClientId("");
      setSuccess("Relationship request sent.");
      await loadRelationships();
    } catch (error) {
      setFormError(getErrorMessage(error));
      if (error instanceof ApiError && (error.status === 400 || error.status === 404 || error.status === 409)) await loadRelationships();
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
          <Link href="/counselor/dashboard" className="font-semibold tracking-tight">Thought Diary</Link>
          <nav className="flex items-center gap-3" aria-label="Counselor navigation">
            <Link href="/counselor/diaries" className="hidden text-sm text-muted-foreground hover:text-foreground sm:inline">Shared diaries</Link>
            <span className="hidden text-sm text-muted-foreground sm:inline">{session?.user.firstName}</span>
            <Button onClick={() => void signOut()} className="px-3 py-2 text-xs">Sign out</Button>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-10 sm:py-14">
        <section className="rounded-3xl border border-border bg-card p-7 shadow-sm sm:p-10">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-muted-foreground">Counselor space</p>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">Welcome back, {session?.user.firstName}.</h1>
          <p className="mt-3 text-muted-foreground">Manage your client relationship requests and connections.</p>
        </section>

        <section className="mt-10 rounded-2xl border border-border bg-card p-6 shadow-sm" aria-labelledby="request-heading">
          <h2 id="request-heading" className="text-xl font-semibold tracking-tight">Request a relationship</h2>
          <p className="mt-2 text-sm text-muted-foreground">Enter the client ID (UUID) provided by your client.</p>
          <form onSubmit={handleSubmit} className="mt-5 space-y-4" noValidate>
            <FormField id="clientId" name="clientId" label="Client ID (UUID)" value={clientId} onChange={(event) => { setClientId(event.target.value); setFieldError(undefined); setFormError(null); setSuccess(null); }} error={fieldError} autoComplete="off" />
            {formError ? <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800" role="alert">{formError}</p> : null}
            {success ? <p className="text-sm text-green-700" role="status">{success}</p> : null}
            <Button type="submit" disabled={submitting}>{submitting ? "Sending…" : "Send request"}</Button>
          </form>
        </section>

        <div className="mt-10" aria-live="polite">
          {loading ? <p className="text-sm text-muted-foreground">Loading relationships…</p> : null}
          {!loading && listError ? <div className="rounded-2xl border border-red-200 bg-red-50 px-6 py-5 text-sm text-red-800" role="alert"><p>{listError}</p><button type="button" className="mt-2 font-medium underline underline-offset-4" onClick={() => void loadRelationships()}>Try again</button></div> : null}
          {!loading && !listError ? <div className="space-y-10">{sections.map(({ status, title, empty }) => {
            const entries = relationships.filter((relationship) => relationship.status === status);
            return <section key={status} aria-labelledby={`section-${status}`}><h2 id={`section-${status}`} className="text-xl font-semibold tracking-tight">{title}</h2>{entries.length ? <div className="mt-4 grid gap-4 md:grid-cols-2">{entries.map((relationship) => <RelationshipCard key={relationship.id} relationship={relationship} userId={session!.user.id} />)}</div> : <p className="mt-4 rounded-2xl border border-dashed border-border px-6 py-8 text-sm text-muted-foreground">{empty}</p>}</section>;
          })}</div> : null}
        </div>
      </main>
    </div>
  );
}

export default function CounselorDashboardPage() {
  return <ProtectedRoute allowedRole="COUNSELOR"><CounselorDashboard /></ProtectedRoute>;
}
