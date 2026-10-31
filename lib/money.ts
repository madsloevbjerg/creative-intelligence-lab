/** Display helpers for the API cost line. Prices live in lib/meta.ts. */

export function formatUsd(value: number): string {
  if (!Number.isFinite(value)) return "$0.00";
  const rounded = Math.round(value * 10000) / 10000;
  if (rounded === 0) return "$0.00";
  if (Math.abs(rounded) < 0.01) return `$${rounded.toFixed(4)}`;
  return `$${rounded.toFixed(2)}`;
}

export function formatBudgetUsd(value: number): string {
  if (!Number.isFinite(value)) return "$0";
  if (Math.abs(value - Math.round(value)) < 1e-8) return `$${Math.round(value)}`;
  return formatUsd(value);
}
