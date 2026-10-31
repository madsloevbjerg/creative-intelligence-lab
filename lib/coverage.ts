import { FORMATS, MOTIVATIONS, type Format, type Motivation } from "@/lib/taxonomy";

export type CellDensity = "empty" | "thin" | "covered";

/** Empty = no ads. Thin = exactly one. Covered = two or more. */
export function cellDensity(count: number): CellDensity {
  if (count <= 0) return "empty";
  if (count === 1) return "thin";
  return "covered";
}

export function cellKey(motivation: Motivation, format: Format): string {
  return `${motivation}::${format}`;
}

export const COVERAGE_ROW_COUNT = MOTIVATIONS.length;
export const COVERAGE_COLUMN_COUNT = FORMATS.length;
export const COVERAGE_CELL_COUNT = COVERAGE_ROW_COUNT * COVERAGE_COLUMN_COUNT;
