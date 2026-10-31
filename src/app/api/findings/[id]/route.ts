import { NextResponse } from "next/server";
import { z } from "zod";
import { mutateDb } from "@/lib/store";
import { newId } from "@/lib/ids";

export const runtime = "nodejs";

const schema = z.object({
  status: z.enum(["open", "upheld", "dismissed", "escalated"]),
  note: z.string().max(500).optional(),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_request", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const updated = await mutateDb((db) => {
    const finding = db.findings.find((entry) => entry.id === id);
    if (!finding) return null;
    finding.status = parsed.data.status;
    if (parsed.data.note !== undefined) finding.reviewerNote = parsed.data.note;
    db.events.push({
      id: newId("evt"),
      at: new Date().toISOString(),
      type: "review",
      message: `Finding ${finding.ruleCode} on ${finding.callId} marked ${parsed.data.status}.`,
      callId: finding.callId,
    });
    return finding;
  });

  if (!updated) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ finding: updated });
}
