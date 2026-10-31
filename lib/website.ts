import "server-only";

import { lookup } from "node:dns/promises";

import { UserFacingError } from "@/lib/errors";

const MAX_PAGE_BYTES = 500_000;
const MAX_TEXT_CHARS = 12_000;

function isBlockedAddress(host: string): boolean {
  const value = host.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    value === "localhost" ||
    value.endsWith(".localhost") ||
    value.endsWith(".local") ||
    value === "metadata.google.internal"
  ) {
    return true;
  }

  if (value.includes(":")) {
    return (
      value === "::1" ||
      value.startsWith("fe80:") ||
      value.startsWith("fc") ||
      value.startsWith("fd")
    );
  }

  const parts = value.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }

  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b !== undefined && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b !== undefined && b >= 64 && b <= 127) return true;
  return false;
}

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Fetch public page text for the brand summary.
 * Redirects and private addresses are refused. Paste the text if this fails.
 */
export async function websiteTextFromUrl(rawUrl: string): Promise<string> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new UserFacingError("That website URL is not valid. Paste the text instead.", 400);
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new UserFacingError("Use an http or https URL, or paste the website text.", 400);
  }
  if (url.username || url.password) {
    throw new UserFacingError("Remove the username and password from the URL, or paste the text.", 400);
  }
  if (isBlockedAddress(url.hostname)) {
    throw new UserFacingError("That address cannot be fetched. Paste the website text instead.", 400);
  }

  let resolved = "";
  try {
    const lookedUp = await lookup(url.hostname);
    resolved = lookedUp.address;
  } catch {
    throw new UserFacingError("That website could not be reached. Paste the text instead.", 400);
  }
  if (isBlockedAddress(resolved)) {
    throw new UserFacingError("That address cannot be fetched. Paste the website text instead.", 400);
  }

  let response: Response;
  try {
    response = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(8000),
      headers: {
        Accept: "text/html,text/plain",
        "User-Agent": "CreativeIntelligenceLab/0.1",
      },
    });
  } catch {
    throw new UserFacingError("That website could not be reached. Paste the text instead.", 400);
  }

  if (response.status >= 300 && response.status < 400) {
    throw new UserFacingError("That URL redirected. Paste the page text instead.", 400);
  }
  if (!response.ok) {
    throw new UserFacingError(
      `The website returned ${response.status}. Paste the page text instead.`,
      400,
    );
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (contentType && !/text\/|xml|json|application\/xhtml/i.test(contentType)) {
    throw new UserFacingError("That URL did not return page text. Paste the text instead.", 400);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new UserFacingError("That page had no text. Paste the website text instead.", 400);
  }

  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > MAX_PAGE_BYTES) {
      await reader.cancel();
      throw new UserFacingError("That page is too large. Paste a shorter extract.", 400);
    }
    chunks.push(value);
  }

  const html = new TextDecoder().decode(Buffer.concat(chunks));
  let text = htmlToText(html);
  if (text.length < 40) {
    throw new UserFacingError(
      "The page did not yield enough text. Paste the website text instead.",
      400,
    );
  }
  if (text.length > MAX_TEXT_CHARS) {
    text = `${text.slice(0, MAX_TEXT_CHARS)} [Text cut after ${MAX_TEXT_CHARS.toLocaleString("en-US")} characters.]`;
  }
  return text;
}
