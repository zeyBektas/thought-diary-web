import type { ZodError } from "zod";

export function getFieldErrors(error: ZodError) {
  return error.issues.reduce<Record<string, string>>((errors, issue) => {
    const field = issue.path[0];
    if (typeof field === "string" && !errors[field]) {
      errors[field] = issue.message;
    }
    return errors;
  }, {});
}

export function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Something went wrong. Please try again.";
}
