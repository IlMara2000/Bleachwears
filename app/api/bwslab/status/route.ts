import { NextResponse } from "next/server";
import { currentBudget } from "@/lib/stencil/budget";
import { IMAGE_SIZE, activeModel, activeProvider, isConfigured } from "@/lib/stencil/provider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    {
      configured: isConfigured(),
      provider: activeProvider() ?? "none",
      model: activeModel(),
      resolution: IMAGE_SIZE,
      /* How many generations are left today: the number to watch before a bill. */
      budget: await currentBudget(),
      /* Which build is actually serving: useful when a deploy or an env var is suspect. */
      build: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local",
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
