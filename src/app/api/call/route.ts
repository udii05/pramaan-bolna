import { NextResponse } from "next/server";
import { z } from "zod";
import { readDb, mutateDb } from "@/lib/store";
import { evaluateGate } from "@/lib/gate";
import { placeCall, bolnaConfigured } from "@/lib/bolna";
import { newId } from "@/lib/ids";

export const runtime = "nodejs";

const schema = z.object({
  contactId: z.string().min(1),
  campaignId: z.string().min(1),
  phone: z.string().min(8).max(20).optional(),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_request", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const db = await readDb();
  const contact = db.contacts.find((entry) => entry.id === parsed.data.contactId);
  const campaign = db.campaigns.find((entry) => entry.id === parsed.data.campaignId);
  if (!contact || !campaign) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const gate = evaluateGate({ contact, campaign, rules: db.rules });
  if (gate.decision !== "allow") {
    await mutateDb((current) => {
      current.events.push({
        id: newId("evt"),
        at: gate.evaluatedAt,
        type: "gate",
        message: `Dial blocked (${gate.decision}) for ${contact.name} on ${campaign.name}.`,
        campaignId: campaign.id,
      });
    });
    return NextResponse.json({ gate, dial: null }, { status: 422 });
  }

  if (bolnaConfigured() && !parsed.data.phone) {
    return NextResponse.json(
      {
        error: "phone_required",
        message:
          "Bolna is configured. Supply the recipient phone number in the request; it is never stored.",
        gate,
      },
      { status: 400 },
    );
  }

  const reference = newId("ref");
  const dial = await placeCall({
    phone: parsed.data.phone ?? "",
    campaignId: campaign.id,
    contactId: contact.id,
    reference,
  });

  await mutateDb((current) => {
    const target = current.contacts.find((entry) => entry.id === contact.id);
    if (target && !dial.simulated) target.attempts.push(new Date().toISOString());
    current.events.push({
      id: newId("evt"),
      at: new Date().toISOString(),
      type: "gate",
      message: dial.simulated
        ? `Gate allowed ${contact.name}; dial simulated (Bolna not configured).`
        : `Gate allowed ${contact.name}; Bolna call ${dial.executionId ?? "queued"}.`,
      campaignId: campaign.id,
    });
  });

  return NextResponse.json({
    gate,
    dial,
    bolnaConfigured: bolnaConfigured(),
    phoneSupplied: Boolean(parsed.data.phone),
  });
}
