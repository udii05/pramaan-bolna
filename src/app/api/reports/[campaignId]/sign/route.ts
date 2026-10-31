import { NextResponse } from "next/server";
import { z } from "zod";
import { mutateDb } from "@/lib/store";
import { signReport } from "@/lib/report";
import { newId } from "@/lib/ids";

export const runtime = "nodejs";

const schema = z.object({
  signedBy: z.string().min(2).max(120),
  reportId: z.string().optional(),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ campaignId: string }> },
) {
  const { campaignId } = await context.params;
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_request", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const signed = await mutateDb((db) => {
    const campaign = db.campaigns.find((entry) => entry.id === campaignId);
    if (!campaign) return null;
    const target = parsed.data.reportId
      ? db.reports.find((entry) => entry.id === parsed.data.reportId)
      : db.reports.find((entry) => entry.campaignId === campaignId);
    if (!target) return null;
    const next = signReport(target, parsed.data.signedBy);
    const index = db.reports.findIndex((entry) => entry.id === target.id);
    db.reports[index] = next;
    db.events.push({
      id: newId("evt"),
      at: next.signedAt ?? new Date().toISOString(),
      type: "report",
      message: `Report ${next.id} signed by ${parsed.data.signedBy}.`,
      campaignId,
    });
    return next;
  });

  if (!signed) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ report: signed });
}
