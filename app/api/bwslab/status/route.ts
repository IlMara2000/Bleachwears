import { NextResponse } from "next/server";
import { currentBudget } from "@/lib/stencil/budget";
import { IMAGE_SIZE, activeModel, activeProvider, isConfigured, type Section } from "@/lib/stencil/provider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Each page answers with its own provider and model: they are separate engines. */
function describe(section: Section) {
  return {
    configured: isConfigured(section),
    provider: activeProvider(section) ?? "none",
    model: activeModel(section),
  };
}

export async function GET(request: Request) {
  /* Each page has its own ceiling, so it asks for its own counter. */
  const scope: Section = new URL(request.url).searchParams.get("scope") === "lab" ? "lab" : "prompt";
  const [lab, prompt] = await Promise.all([currentBudget("lab"), currentBudget("prompt")]);
  const current = describe(scope);

  return NextResponse.json(
    {
      ...current,
      resolution: IMAGE_SIZE,
      scope,
      /* How many generations are left today: the number to watch before a bill. */
      budget: scope === "lab" ? lab : prompt,
      budgets: { lab, prompt },
      /* Both pages, so a suspect key can be read without guessing which one. */
      pages: { lab: describe("lab"), prompt: describe("prompt") },
      /* Which build is actually serving: useful when a deploy or an env var is suspect. */
      build: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local",
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
