import { NextResponse } from "next/server";
import { z } from "zod";
import { readDb, mutateDb } from "@/lib/store";
import { evaluateGate } from "@/lib/gate";
import { newId } from "@/lib/ids";

export const runtime = "nodejs";

const schema = z.object({
  contactId: z.string().min(1),
  campaignId: z.string().min(1),
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

  await mutateDb((current) => {
    current.events.push({
      id: newId("evt"),
      at: gate.evaluatedAt,
      type: "gate",
      message: `Gate ${gate.decision} for ${contact.name} on ${campaign.name}.`,
      campaignId: campaign.id,
    });
  });

  return NextResponse.json({
    gate,
    contact: {
      id: contact.id,
      name: contact.name,
      phoneMasked: contact.phoneMasked,
      timeZone: contact.timeZone,
    },
    campaign: { id: campaign.id, name: campaign.name, status: campaign.status },
  });
}
