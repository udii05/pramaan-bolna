import { NextResponse } from "next/server";
import { mutateDb } from "@/lib/store";
import { buildReport } from "@/lib/report";
import { newId } from "@/lib/ids";

export const runtime = "nodejs";

export async function POST(
  _request: Request,
  context: { params: Promise<{ campaignId: string }> },
) {
  const { campaignId } = await context.params;

  const report = await mutateDb((db) => {
    const campaign = db.campaigns.find((entry) => entry.id === campaignId);
    if (!campaign) return null;
    const built = buildReport({
      campaign,
      calls: db.calls,
      findings: db.findings,
      policy: db.policy,
    });
    db.reports.unshift(built);
    db.events.push({
      id: newId("evt"),
      at: built.generatedAt,
      type: "report",
      message: `Report generated for ${campaign.name}: ${built.callCount} calls, ${built.findingCount} findings.`,
      campaignId: campaign.id,
    });
    return built;
  });

  if (!report) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ report });
}
