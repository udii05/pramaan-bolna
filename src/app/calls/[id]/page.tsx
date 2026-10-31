import { notFound } from "next/navigation";
import { readDb } from "@/lib/store";
import { CallDetail } from "@/components/call-detail";

export const dynamic = "force-dynamic";

export default async function CallPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await readDb();
  const call = db.calls.find((entry) => entry.id === id);
  if (!call) notFound();

  const campaign = db.campaigns.find((entry) => entry.id === call.campaignId) ?? null;
  const contact = call.contactId
    ? db.contacts.find((entry) => entry.id === call.contactId) ?? null
    : null;
  const findings = db.findings
    .filter((finding) => finding.callId === call.id)
    .sort((a, b) => a.startMs - b.startMs);
  const ruleTitles = Object.fromEntries(db.rules.map((rule) => [rule.code, rule.title]));

  return (
    <CallDetail
      call={call}
      findings={findings}
      campaign={campaign ? { id: campaign.id, name: campaign.name, client: campaign.client } : null}
      contact={
        contact
          ? {
              id: contact.id,
              name: contact.name,
              phoneMasked: contact.phoneMasked,
              timeZone: contact.timeZone,
            }
          : null
      }
      ruleTitles={ruleTitles}
    />
  );
}
