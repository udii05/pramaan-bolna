import { NextResponse } from "next/server";
import { z } from "zod";
import { resetDb } from "@/lib/store";

export const runtime = "nodejs";

const schema = z.object({ confirm: z.literal("reset") });

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "confirmation_required", message: 'Send {"confirm":"reset"} to reseed.' },
      { status: 400 },
    );
  }

  const db = await resetDb();
  return NextResponse.json({
    ok: true,
    calls: db.calls.length,
    findings: db.findings.length,
    campaigns: db.campaigns.length,
    contacts: db.contacts.length,
  });
}
