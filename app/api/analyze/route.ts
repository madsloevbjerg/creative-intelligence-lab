import { UserFacingError } from "@/lib/errors";
import { MAX_ANALYZE_BODY_BYTES } from "@/lib/limits";
import { analyzePortfolio } from "@/lib/analyze";
import { resolveLiveAccess } from "@/lib/meta";

function accessCodeFrom(body: unknown): string {
  if (!body || typeof body !== "object" || !("accessCode" in body)) return "";
  const value = (body as { accessCode?: unknown }).accessCode;
  if (value === undefined || value === null || value === "") return "";
  if (typeof value !== "string") {
    throw new UserFacingError("The access code must be text.", 400);
  }
  if (value.length > 200) {
    throw new UserFacingError("The access code is too long.", 400);
  }
  return value;
}

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_ANALYZE_BODY_BYTES) {
    return Response.json(
      {
        error:
          "That upload is too large. Each image must be 5 MB or smaller, and a run can include at most 20 images.",
      },
      { status: 413 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: "The request was not valid JSON." },
      { status: 400 },
    );
  }

  try {
    const accessCode = accessCodeFrom(body);
    const decision = resolveLiveAccess(accessCode);
    const result = await analyzePortfolio(body, decision);
    return Response.json(result);
  } catch (error) {
    if (error instanceof UserFacingError) {
      return Response.json(
        { error: error.message, cost: error.cost },
        { status: error.status },
      );
    }
    const message = error instanceof Error ? error.message : "Unknown error.";
    console.error("analyze failed:", message);
    return Response.json(
      { error: "The analysis failed before a result was ready." },
      { status: 500 },
    );
  }
}
