import { z } from "zod";

const entryTypes = [
  "THOUGHT_RECORD",
  "PANIC_LOG",
  "GRATITUDE",
  "MOOD_CHECK",
  "FREE_JOURNAL",
] as const;

const visibilities = ["PRIVATE", "COUNSELOR"] as const;

const optionalInteger = z.preprocess(
  (value) => (value === "" || value === undefined ? undefined : Number(value)),
  z.number().int().optional(),
);

export const diaryFormSchema = z.object({
  entryType: z.enum(entryTypes),
  contentInput: z.string().trim().min(1, "Write something before saving."),
  primaryEmotionId: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().uuid().optional(),
  ),
  intensityBefore: optionalInteger,
  intensityAfter: optionalInteger,
  visibility: z.enum(visibilities),
});

export interface DiaryFormValues {
  entryType: (typeof entryTypes)[number];
  contentInput: string;
  primaryEmotionId: string;
  intensityBefore: string | number;
  intensityAfter: string | number;
  visibility: (typeof visibilities)[number];
}

export const diarySchema = z.object({
  entryType: z.enum(entryTypes),
  content: z.record(z.string(), z.unknown()),
  primaryEmotionId: z.string().uuid().optional(),
  intensityBefore: z.number().int().optional(),
  intensityAfter: z.number().int().optional(),
  visibility: z.enum(["PRIVATE", "COUNSELOR", "ORGANIZATION", "PUBLIC"]).optional(),
});
