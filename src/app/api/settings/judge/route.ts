import { NextResponse } from "next/server";
import { z } from "zod";
import { readDb, mutateDb } from "@/lib/store";
import { hasApiKey } from "@/lib/judge";
import { newId } from "@/lib/ids";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ mode: z.enum(["heuristic", "llm"]) });

export async function GET() {
  const db = await readDb();
  return NextResponse.json({
    mode: db.settings?.judgeMode ?? "heuristic",
    hasKey: hasApiKey(),
  });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const mode = parsed.data.mode;
  if (mode === "llm" && !hasApiKey()) {
    return NextResponse.json(
      {
        error: "no_api_key",
        message: "Set GEMINI_API_KEY (free tier) or OPENAI_API_KEY before switching to the LLM judge.",
      },
      { status: 400 },
    );
  }

  await mutateDb((db) => {
    db.settings = { judgeMode: mode };
    db.events.push({
      id: newId("evt"),
      at: new Date().toISOString(),
      type: "audit",
      message: `Audit engine switched to ${mode}.`,
    });
  });

  return NextResponse.json({ mode, hasKey: hasApiKey() });
}
