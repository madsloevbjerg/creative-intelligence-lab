import type { ZodError } from "zod";

/** The model (or the mock) returned something we will not repair. */
export class ModelOutputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModelOutputError";
  }
}

export type CostSummary = {
  runUsd: number;
  cachedUsd: number;
  totalUsd: number;
  budgetUsd: number;
};

/** A message that is safe to show in the UI, with an HTTP status. */
export class UserFacingError extends Error {
  readonly status: number;
  cost?: CostSummary;

  constructor(message: string, status: number, cost?: CostSummary) {
    super(message);
    this.name = "UserFacingError";
    this.status = status;
    this.cost = cost;
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
