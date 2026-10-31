import { EXECUTIONS, MOTIVATIONS, type Execution, type Motivation } from "@/lib/taxonomy";

export type CellDensity = "empty" | "thin" | "covered";

/** Empty = no ads. Thin = exactly one. Covered = two or more. */
export function cellDensity(count: number): CellDensity {
  if (count <= 0) return "empty";
  if (count === 1) return "thin";
  return "covered";
}

export function cellKey(motivation: Motivation, execution: Execution): string {
  return `${motivation}::${execution}`;
}

export const COVERAGE_ROW_COUNT = MOTIVATIONS.length;
export const COVERAGE_COLUMN_COUNT = EXECUTIONS.length;
export const COVERAGE_CELL_COUNT = COVERAGE_ROW_COUNT * COVERAGE_COLUMN_COUNT;
