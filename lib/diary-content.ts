import type { JsonValue } from "@/types/api";

export function isJsonObject(value: JsonValue): value is Record<string, JsonValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function getDiaryText(content: JsonValue) {
  if (isJsonObject(content) && typeof content.text === "string") {
    return content.text;
  }

  return null;
}

export function getEditorContent(content: JsonValue) {
  const text = getDiaryText(content);
  return text ?? JSON.stringify(content, null, 2);
}

export function parseEditorContent(value: string, isJsonMode: boolean): JsonValue {
  if (!isJsonMode) {
    return { text: value.trim() };
  }

  const parsed: unknown = JSON.parse(value);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("JSON content must be a non-null object.");
  }

  return parsed as JsonValue;
}

export function formatEmotionCode(code: string) {
  return code
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function formatEntryType(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
