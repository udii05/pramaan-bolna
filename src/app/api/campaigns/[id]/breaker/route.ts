import { NextResponse } from "next/server";
import { z } from "zod";
import { mutateDb } from "@/lib/store";
import { newId } from "@/lib/ids";

export const runtime = "nodejs";

const schema = z.object({
  action: z.enum(["pause", "resume"]),
  reason: z.string().max(300).optional(),
});

export async function POST(
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

  const campaign = await mutateDb((db) => {
    const target = db.campaigns.find((entry) => entry.id === id);
    if (!target) return null;
    if (parsed.data.action === "pause") {
      target.status = "paused";
      target.pauseReason = parsed.data.reason ?? "Paused manually by compliance.";
    } else {
      target.status = "active";
      delete target.pauseReason;
    }
    db.events.push({
      id: newId("evt"),
      at: new Date().toISOString(),
      type: "breaker",
      message:
        parsed.data.action === "pause"
          ? `Campaign paused manually: ${target.pauseReason}.`
          : "Campaign resumed manually. Blocked contacts stay blocked.",
      campaignId: target.id,
    });
    return target;
  });

  if (!campaign) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ campaign });
}
