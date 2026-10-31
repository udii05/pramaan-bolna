import { NextResponse } from "next/server";
import { z } from "zod";
import { mutateDb } from "@/lib/store";
import { newId } from "@/lib/ids";

export const runtime = "nodejs";

const schema = z.object({ recordingUrl: z.string().url() });

/**
 * Attach a real recording URL to an existing call so its findings become
 * playable. Used to drop a genuine Bolna recording onto a seeded call, or to
 * backfill a URL that arrived after ingest.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const call = await mutateDb((db) => {
    const target = db.calls.find((entry) => entry.id === id);
    if (!target) return null;
    target.recordingUrl = parsed.data.recordingUrl;
    db.events.push({
      id: newId("evt"),
      at: new Date().toISOString(),
      type: "ingest",
      message: `Recording attached to ${target.id}.`,
      callId: target.id,
      campaignId: target.campaignId,
    });
    return target;
  });

  if (!call) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ call });
}
