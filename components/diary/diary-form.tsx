"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { listShareableCounselors } from "@/lib/api/relationships";
import { getDiaryShares } from "@/lib/api/diaries";
import { ApiError } from "@/lib/api/client";
import { getDiaryText, getEditorContent, parseEditorContent } from "@/lib/diary-content";
import { getErrorMessage, getFieldErrors } from "@/lib/forms";
import { diaryFormSchema, type DiaryFormValues } from "@/schemas/diary";
import type {
  CreateDiaryInput,
  CounselorRecipient,
  Diary,
  DiarySharingState,
  Emotion,
  JournalEntryType,
  JournalVisibility,
  UpdateDiaryInput,
} from "@/types/api";

const entryTypeOptions: Array<{ value: JournalEntryType; label: string }> = [
  { value: "THOUGHT_RECORD", label: "Thought record" },
  { value: "PANIC_LOG", label: "Panic log" },
  { value: "GRATITUDE", label: "Gratitude" },
  { value: "MOOD_CHECK", label: "Mood check" },
  { value: "FREE_JOURNAL", label: "Free journal" },
];

const visibilityOptions: Array<{ value: JournalVisibility; label: string }> = [
  { value: "PRIVATE", label: "Private" },
  { value: "COUNSELOR", label: "Share with counselor" },
];

interface DiaryFormProps {
  diary?: Diary;
  emotions: Emotion[];
  isSubmitting: boolean;
  submitLabel: string;
  onSubmit: (input: CreateDiaryInput | UpdateDiaryInput) => Promise<void>;
  sharingAccessToken?: string;
  initialSharing?: DiarySharingState;
  sharingBlocked?: boolean;
}

function initialValues(diary?: Diary): DiaryFormValues {
  return {
    entryType: diary?.entryType ?? "FREE_JOURNAL",
    contentInput: diary ? getEditorContent(diary.content) : "",
    primaryEmotionId: diary?.primaryEmotionId ?? "",
    intensityBefore: diary?.intensityBefore ?? "",
    intensityAfter: diary?.intensityAfter ?? "",
    visibility: diary?.visibility === "COUNSELOR" ? "COUNSELOR" : "PRIVATE",
  };
}

export function DiaryForm({
  diary,
  emotions,
  isSubmitting,
  submitLabel,
  onSubmit,
  sharingAccessToken,
  initialSharing,
  sharingBlocked = false,
}: DiaryFormProps) {
  const [values, setValues] = useState<DiaryFormValues>(() => initialValues(diary));
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof DiaryFormValues, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [counselors, setCounselors] = useState<CounselorRecipient[] | null>(null);
  const [recipientIds, setRecipientIds] = useState<string[]>(() => initialSharing?.recipients.map((item) => item.relationshipId) ?? []);
  const [baselineIds, setBaselineIds] = useState<string[]>(() => initialSharing?.recipients.map((item) => item.relationshipId) ?? []);
  const [shareVersion, setShareVersion] = useState(initialSharing?.shareVersion);
  const [recovery, setRecovery] = useState<"conflict" | "eligibility" | null>(null);
  const [refreshed, setRefreshed] = useState<DiarySharingState | null>(null);
  const [attemptedNames, setAttemptedNames] = useState<string[]>([]);
  const [acceptedExternalSharing, setAcceptedExternalSharing] = useState(initialSharing);
  const [lookupStatus, setLookupStatus] = useState<"idle" | "loading" | "error" | "loaded">("idle");
  const [lookupError, setLookupError] = useState<string | null>(null);
  const lookupVersion = useRef(0);
  const lookupPending = useRef(false);
  const submitting = useRef(false);
  const isJsonMode = Boolean(diary && getDiaryText(diary.content) === null);
  const visibilityChanged = Boolean(diary && values.visibility !== diary.visibility);
  const recipientsChanged = recipientIds.length !== baselineIds.length || recipientIds.some((id) => !baselineIds.includes(id));
  const sharingChanged = Boolean(diary && (visibilityChanged || (values.visibility === "COUNSELOR" && recipientsChanged)));
  const requiresCounselorLookup = Boolean(
    sharingAccessToken &&
      values.visibility === "COUNSELOR" &&
      (!diary || sharingChanged),
  );
  const externalSharingChanged = Boolean(initialSharing && acceptedExternalSharing && (
    initialSharing.shareVersion !== acceptedExternalSharing.shareVersion ||
    initialSharing.recipients.length !== acceptedExternalSharing.recipients.length ||
    initialSharing.recipients.some(({ relationshipId }) => !acceptedExternalSharing.recipients.some((item) => item.relationshipId === relationshipId))
  ));
  const emotionOptions = useMemo(
    () => [...emotions].sort((a, b) => a.code.localeCompare(b.code)),
    [emotions],
  );

  useEffect(() => () => { lookupVersion.current += 1; }, []);

  async function loadCounselors() {
    if (!sharingAccessToken || lookupPending.current) return;
    const version = ++lookupVersion.current;
    lookupPending.current = true;
    setLookupStatus("loading");
    setLookupError(null);
    try {
      const response = await listShareableCounselors(sharingAccessToken);
      if (version === lookupVersion.current) {
        setCounselors(response.counselors);
        setLookupStatus("loaded");
      }
    } catch (error) {
      if (version === lookupVersion.current) {
        setLookupError(getErrorMessage(error));
        setLookupStatus("error");
      }
    } finally {
      if (version === lookupVersion.current) lookupPending.current = false;
    }
  }

  async function refreshSharing() {
    if (!diary || !sharingAccessToken || lookupPending.current) return;
    const version = ++lookupVersion.current;
    lookupPending.current = true;
    setLookupStatus("loading");
    setLookupError(null);
    try {
      const [shares, eligible] = await Promise.all([getDiaryShares(sharingAccessToken, diary.id), listShareableCounselors(sharingAccessToken)]);
      if (version === lookupVersion.current) {
        setRefreshed(shares);
        setCounselors(eligible.counselors);
        setLookupStatus("loaded");
      }
    } catch (error) {
      if (version === lookupVersion.current) { setLookupError(getErrorMessage(error)); setLookupStatus("error"); }
    } finally {
      if (version === lookupVersion.current) lookupPending.current = false;
    }
  }

  function updateField<K extends keyof DiaryFormValues>(field: K, value: DiaryFormValues[K]) {
    setValues((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
    setFormError(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || isSubmitting || recovery || sharingBlocked || externalSharingChanged || (requiresCounselorLookup && lookupStatus !== "loaded") || (sharingChanged && !shareVersion)) return;
    setFormError(null);

    const parsed = diaryFormSchema.safeParse(values);
    if (!parsed.success) {
      setFieldErrors(getFieldErrors(parsed.error) as Partial<Record<keyof DiaryFormValues, string>>);
      return;
    }

    let content: CreateDiaryInput["content"];
    try {
      content = parseEditorContent(parsed.data.contentInput, isJsonMode);
    } catch (error) {
      setFieldErrors((current) => ({
        ...current,
        contentInput: getErrorMessage(error),
      }));
      return;
    }

    setFieldErrors({});

    const primaryEmotionId = parsed.data.primaryEmotionId || (diary ? null : undefined);
    const input: CreateDiaryInput | UpdateDiaryInput = {
      entryType: parsed.data.entryType,
      content,
      ...(primaryEmotionId !== undefined ? { primaryEmotionId } : {}),
      ...(parsed.data.intensityBefore !== undefined
        ? { intensityBefore: parsed.data.intensityBefore }
        : {}),
      ...(parsed.data.intensityAfter !== undefined
        ? { intensityAfter: parsed.data.intensityAfter }
        : {}),
      ...(!diary || visibilityChanged ? { visibility: parsed.data.visibility } : {}),
      ...(!diary && sharingAccessToken && parsed.data.visibility === "COUNSELOR"
        ? { recipientRelationshipIds: recipientIds }
        : {}),
      ...(diary && sharingChanged ? { recipientRelationshipIds: parsed.data.visibility === "PRIVATE" ? [] : recipientIds, shareVersion } : {}),
    };

    submitting.current = true;
    try {
      await onSubmit(input);
    } catch (error) {
      if (diary && sharingChanged && error instanceof ApiError && (error.status === 409 || error.status === 400)) {
        setRecovery(error.status === 409 ? "conflict" : "eligibility");
        setAttemptedNames(recipientIds.map((id) => { const item = counselors?.find((person) => person.relationshipId === id); return item ? `${item.counselor.firstName} ${item.counselor.lastName}` : id; }));
        setRefreshed(null);
      } else setFormError(getErrorMessage(error));
    } finally {
      submitting.current = false;
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6" noValidate>
      {formError ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800" role="alert">
          {formError}
        </p>
      ) : null}
      {sharingBlocked ? <p role="status" className="text-sm text-muted-foreground">Saving is unavailable until current sharing information is loaded.</p> : null}
      {externalSharingChanged && initialSharing ? <div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><p>Sharing changed while you were editing. Your draft and selected recipients are preserved.</p><p>Current recipients: {initialSharing.recipients.length ? initialSharing.recipients.map(({ counselor }) => `${counselor.firstName} ${counselor.lastName}`).join(", ") : "None"}.</p><p>Review your selection and the current recipients before continuing.</p><button type="button" className="mt-2 underline" onClick={() => { setAcceptedExternalSharing(initialSharing); setShareVersion(initialSharing.shareVersion); setBaselineIds(initialSharing.recipients.map((item) => item.relationshipId)); }}>Keep my selection and review</button><button type="button" className="ml-4 mt-2 underline" onClick={() => { setAcceptedExternalSharing(initialSharing); setShareVersion(initialSharing.shareVersion); const ids = initialSharing.recipients.map((item) => item.relationshipId); setBaselineIds(ids); setRecipientIds(ids); }}>Use current recipients and review</button></div> : null}
      {recovery ? <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800"><p>{recovery === "conflict" ? "Sharing changed elsewhere." : "Counselor eligibility or access may have changed."} Your unsaved changes and attempted selection are preserved.</p><p>Attempted recipients: {attemptedNames.length ? attemptedNames.join(", ") : "None"}.</p><button type="button" className="mt-2 underline" onClick={() => void refreshSharing()} disabled={lookupStatus === "loading"}>Reload sharing and eligible counselors</button>{lookupError ? <p>{lookupError}</p> : null}{refreshed ? <div className="mt-3"><p>Current recipients: {refreshed.recipients.length ? refreshed.recipients.map(({ counselor }) => `${counselor.firstName} ${counselor.lastName}`).join(", ") : "None"}.</p><p>Review the current recipients before choosing how to continue.</p><button type="button" className="mt-2 underline" onClick={() => { setShareVersion(refreshed.shareVersion); setBaselineIds(refreshed.recipients.map((item) => item.relationshipId)); setRecipientIds(refreshed.recipients.map((item) => item.relationshipId)); setRecovery(null); setRefreshed(null); }}>Use current recipients and review</button></div> : null}</div> : null}

      <div className="grid gap-5 sm:grid-cols-2">
        <label className="space-y-2 text-sm font-medium">
          <span>Entry type</span>
          <select
            value={values.entryType}
            onChange={(event) => updateField("entryType", event.target.value as JournalEntryType)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2.5 font-normal outline-none focus:border-foreground focus:ring-2 focus:ring-foreground/10"
          >
            {entryTypeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-2 text-sm font-medium">
          <span>Visibility</span>
          <select
            value={values.visibility}
            onChange={(event) => {
              const visibility = event.target.value as DiaryFormValues["visibility"];
              updateField("visibility", visibility);
              if (visibility === "COUNSELOR" && sharingAccessToken && lookupStatus === "idle") void loadCounselors();
            }}
            className="w-full rounded-lg border border-border bg-background px-3 py-2.5 font-normal outline-none focus:border-foreground focus:ring-2 focus:ring-foreground/10"
          >
            {visibilityOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      {diary && visibilityChanged && values.visibility === "PRIVATE" ? <p className="text-sm text-muted-foreground">Saving privately removes counselor access.</p> : null}

      {sharingAccessToken && values.visibility === "COUNSELOR" ? (
        <fieldset className="space-y-3 rounded-xl border border-border p-4" aria-describedby="recipient-help">
          <legend className="px-1 text-sm font-medium">Choose counselors</legend>
          <p id="recipient-help" className="text-sm text-muted-foreground">Only selected counselors can access this entry. If you select none, no counselor can access it.</p>
          {lookupStatus === "idle" ? <div><p className="text-sm text-muted-foreground">Sharing options are loaded only when you choose to manage recipients.</p><button type="button" className="mt-2 font-medium underline" onClick={() => void loadCounselors()}>Load counselor options</button></div> : null}
          {lookupStatus === "loading" ? <p role="status" className="text-sm text-muted-foreground">Loading eligible counselors…</p> : null}
          {lookupStatus === "error" && !recovery ? <div role="alert" className="text-sm text-red-700"><p>Could not load eligible counselors: {lookupError}</p><button type="button" className="mt-2 font-medium underline" onClick={() => void loadCounselors()}>Retry counselor lookup</button></div> : null}
          {lookupStatus === "loaded" && counselors?.length === 0 ? <p className="text-sm text-muted-foreground">No active eligible counselors are available. You can save this entry without sharing it with anyone.</p> : null}
          {lookupStatus === "loaded" ? counselors?.map(({ relationshipId, counselor }) => (
            <label key={relationshipId} className="flex items-center gap-3 text-sm">
              <input type="checkbox" checked={recipientIds.includes(relationshipId)} onChange={(event) => setRecipientIds((current) => event.target.checked ? [...current, relationshipId] : current.filter((id) => id !== relationshipId))} />
              <span>{counselor.firstName} {counselor.lastName}{counselor.username ? ` (@${counselor.username})` : ""}</span>
            </label>
          )) : null}
        </fieldset>
      ) : null}

      <label className="block space-y-2 text-sm font-medium">
        <span>{isJsonMode ? "Content JSON" : "What would you like to write?"}</span>
        <textarea
          value={values.contentInput}
          onChange={(event) => updateField("contentInput", event.target.value)}
          rows={12}
          aria-invalid={Boolean(fieldErrors.contentInput)}
          aria-describedby={fieldErrors.contentInput ? "content-error" : "content-help"}
          className="w-full resize-y rounded-xl border border-border bg-background px-4 py-3 text-base leading-7 outline-none focus:border-foreground focus:ring-2 focus:ring-foreground/10"
          placeholder={isJsonMode ? '{\n  "yourField": "your value"\n}' : "Begin wherever you are…"}
        />
        <span id="content-help" className="block font-normal text-muted-foreground">
          {isJsonMode
            ? "This entry uses a JSON object shape that is not text-only. Keep it as a valid JSON object."
            : "New entries are saved as a JSON object with a text field."}
        </span>
        {fieldErrors.contentInput ? (
          <span id="content-error" className="block font-normal text-red-700" role="alert">
            {fieldErrors.contentInput}
          </span>
        ) : null}
      </label>

      <div className="grid gap-5 sm:grid-cols-3">
        <label className="space-y-2 text-sm font-medium">
          <span>Primary emotion</span>
          <select
            value={values.primaryEmotionId}
            onChange={(event) => updateField("primaryEmotionId", event.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2.5 font-normal outline-none focus:border-foreground focus:ring-2 focus:ring-foreground/10"
          >
            <option value="">None selected</option>
            {emotionOptions.map((emotion) => (
              <option key={emotion.id} value={emotion.id}>
                {emotion.code.toLowerCase().replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-2 text-sm font-medium">
          <span>Intensity before</span>
          <input
            type="number"
            step="1"
            value={values.intensityBefore as string | number}
            onChange={(event) => updateField("intensityBefore", event.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2.5 font-normal outline-none focus:border-foreground focus:ring-2 focus:ring-foreground/10"
          />
        </label>

        <label className="space-y-2 text-sm font-medium">
          <span>Intensity after</span>
          <input
            type="number"
            step="1"
            value={values.intensityAfter as string | number}
            onChange={(event) => updateField("intensityAfter", event.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2.5 font-normal outline-none focus:border-foreground focus:ring-2 focus:ring-foreground/10"
          />
        </label>
      </div>

      {fieldErrors.primaryEmotionId || fieldErrors.intensityBefore || fieldErrors.intensityAfter ? (
        <p className="text-sm text-red-700" role="alert">
          {fieldErrors.primaryEmotionId ??
            fieldErrors.intensityBefore ??
            fieldErrors.intensityAfter}
        </p>
      ) : null}

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button type="submit" disabled={isSubmitting || sharingBlocked || externalSharingChanged || Boolean(recovery) || Boolean(requiresCounselorLookup && lookupStatus !== "loaded")} className="sm:min-w-36">
          {isSubmitting ? "Saving…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}
