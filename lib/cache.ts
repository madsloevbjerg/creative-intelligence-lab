import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { ZodType } from "zod";

export type CacheScope = "demo" | "private";

export type CacheEntry<T> = {
  priceUsd: number;
  result: T;
};

const DEMO_CACHE_DIR = path.join(process.cwd(), "data", "cache");
const PRIVATE_CACHE_DIR = path.join(process.cwd(), ".data", "cache");

function cacheDir(scope: CacheScope): string {
  return scope === "demo" ? DEMO_CACHE_DIR : PRIVATE_CACHE_DIR;
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => canonical(item)).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

/** Hash of the full request. The file name is the hash, so the file holds no secrets. */
export function requestKey(material: unknown): string {
  return createHash("sha256").update(canonical(material)).digest("hex");
}

export function readCache<T>(scope: CacheScope, key: string, schema: ZodType<T>): CacheEntry<T> | null {
  try {
    const raw = readFileSync(path.join(cacheDir(scope), `${key}.json`), "utf8");
    const parsed = JSON.parse(raw) as { priceUsd?: unknown; result?: unknown };
    if (typeof parsed.priceUsd !== "number" || !Number.isFinite(parsed.priceUsd) || parsed.priceUsd < 0) {
      return null;
    }
    const result = schema.safeParse(parsed.result);
    if (!result.success) return null;
    return { priceUsd: parsed.priceUsd, result: result.data };
  } catch {
    return null;
  }
}

export function writeCache<T>(scope: CacheScope, key: string, entry: CacheEntry<T>): void {
  const dir = cacheDir(scope);
  mkdirSync(dir, { recursive: true });
  const body = {
    priceUsd: entry.priceUsd,
    result: entry.result,
  };
  writeFileSync(path.join(dir, `${key}.json`), `${JSON.stringify(body)}\n`);
}
