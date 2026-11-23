"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { listRelationships, respondToRelationship, revokeRelationship } from "@/lib/api/relationships";
import { getErrorMessage } from "@/lib/forms";
import { ApiError } from "@/lib/api/client";
import type { Relationship } from "@/types/api";

export function ClientRelationships() {
  const { session } = useAuth();
  const token = session?.accessToken;
  const userId = session?.user.id;
  const [relationships, setRelationships] = useState<Relationship[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const actionPending = useRef(false);
  const version = useRef(0);

  const load = useCallback(async () => {
    if (!token) return;
    const current = ++version.current;
    setLoading(true);
    setListError(null);
    try {
      const result = await listRelationships(token);
      if (current === version.current) setRelationships(result);
    } catch (error) {
      if (current === version.current) setListError(getErrorMessage(error));
    } finally {
      if (current === version.current) setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => void load());
    return () => { window.cancelAnimationFrame(frame); version.current += 1; };
  }, [load]);

  async function handleAction(relationship: Relationship, action: "ACTIVE" | "REJECTED" | "REVOKED") {
    if (!token || actionPending.current || relationship.clientId !== userId) return;
    if (action === "REVOKED" && !window.confirm("Revoke this counselor relationship?")) return;
    actionPending.current = true;
    setPendingId(relationship.id);
    setActionError(null);
    setSuccess(null);
    try {
      if (action === "REVOKED") await revokeRelationship(token, relationship.id);
      else await respondToRelationship(token, relationship.id, action);
      setSuccess(action === "ACTIVE" ? "Request accepted." : action === "REJECTED" ? "Request rejected." : "Relationship revoked.");
      await load();
    } catch (error) {
      setActionError(getErrorMessage(error));
      if (error instanceof ApiError && (error.status === 400 || error.status === 404 || error.status === 409)) await load();
    } finally {
      actionPending.current = false;
      setPendingId(null);
    }
  }

  const incoming = relationships.filter((r) => r.clientId === userId && r.status === "PENDING");
  const active = relationships.filter((r) => r.clientId === userId && r.status === "ACTIVE");
  const past = relationships.filter((r) => r.clientId === userId && (r.status === "REJECTED" || r.status === "REVOKED"));
  const groups = [
    { title: "Incoming requests", entries: incoming, empty: "No incoming requests." },
    { title: "Active relationships", entries: active, empty: "No active counselor relationships." },
    { title: "Past relationships", entries: past, empty: "No rejected or revoked relationships." },
  ];

  return (
    <section className="mt-10 space-y-5" aria-labelledby="relationships-heading">
      <div><h2 id="relationships-heading" className="text-xl font-semibold tracking-tight">Counselor relationships</h2><p className="mt-1 text-sm text-muted-foreground">Review requests and manage your connections.</p></div>
      {success ? <p className="text-sm text-green-700" role="status">{success}</p> : null}
      {actionError ? <p className="rounded-2xl border border-red-200 bg-red-50 px-6 py-5 text-sm text-red-800" role="alert">{actionError}</p> : null}
      {loading ? <p className="text-sm text-muted-foreground">Loading relationships…</p> : null}
      {!loading && listError ? <div className="rounded-2xl border border-red-200 bg-red-50 px-6 py-5 text-sm text-red-800" role="alert"><p>{listError}</p><button type="button" className="mt-2 font-medium underline underline-offset-4" onClick={() => void load()}>Try again</button></div> : null}
      {!loading && !listError ? groups.map((group) => (
        <section key={group.title} aria-label={group.title} className="space-y-3">
          <h3 className="font-semibold">{group.title}</h3>
          {group.entries.length === 0 ? <p className="rounded-2xl border border-dashed border-border px-6 py-6 text-sm text-muted-foreground">{group.empty}</p> : <div className="grid gap-4 md:grid-cols-2">{group.entries.map((relationship) => {
            const counselor = relationship.counselor;
            const name = [counselor.firstName, counselor.lastName].filter(Boolean).join(" ") || counselor.email;
            return <article key={relationship.id} className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <h4 className="font-semibold">{name}</h4>
              <p className="mt-1 break-all text-sm text-muted-foreground">{counselor.email}</p>
              <p className="mt-2 text-sm capitalize text-muted-foreground">{relationship.status.toLowerCase()} · Request from counselor</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {/* The ref is read only inside the click handler to prevent concurrent actions. */}
                {/* eslint-disable-next-line react-hooks/refs */}
                {relationship.status === "PENDING" ? <><Button disabled={pendingId !== null} onClick={() => void handleAction(relationship, "ACTIVE")}>Accept</Button><Button disabled={pendingId !== null} onClick={() => void handleAction(relationship, "REJECTED")}>Reject</Button></> : null}
                {relationship.status === "ACTIVE" ? <Button disabled={pendingId !== null} onClick={() => void handleAction(relationship, "REVOKED")}>Revoke</Button> : null}
              </div>
            </article>;
          })}</div>}
        </section>
      )) : null}
    </section>
  );
}
