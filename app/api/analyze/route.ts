import { UserFacingError } from "@/lib/errors";
import { analyzePortfolio } from "@/lib/analyze";

export async function POST(request: Request) {
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
    const result = await analyzePortfolio(body);
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
