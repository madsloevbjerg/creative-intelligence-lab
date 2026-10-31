import type { ZodError } from "zod";

/** The model (or the mock) returned something we will not repair. */
export class ModelOutputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModelOutputError";
  }
}

/** A message that is safe to show in the UI, with an HTTP status. */
export class UserFacingError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "UserFacingError";
    this.status = status;
  }
}

export function formatZodIssues(error: ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "response";
      return `${path}: ${issue.message}`;
    })
    .join("; ");
}
