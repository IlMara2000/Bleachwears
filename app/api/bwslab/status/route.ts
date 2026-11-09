import { NextResponse } from "next/server";
import { IMAGE_SIZE, MODEL, isConfigured } from "@/lib/stencil/provider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    { configured: isConfigured(), model: MODEL, resolution: IMAGE_SIZE },
    { headers: { "Cache-Control": "no-store" } },
  );
}
