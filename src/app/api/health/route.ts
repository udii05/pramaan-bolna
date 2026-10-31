import { NextResponse } from "next/server";
import { readDb, dbPath } from "@/lib/store";
import { hasApiKey, judgeProvider } from "@/lib/judge";
import { bolnaConfigured } from "@/lib/bolna";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const db = await readDb();
  const mode = db.settings?.judgeMode ?? "heuristic";
  return NextResponse.json({
    ok: true,
    judge: mode === "llm" && hasApiKey() ? "llm" : "heuristic",
    judgeMode: mode,
    judgeProvider: judgeProvider(),
    bolnaConfigured: bolnaConfigured(),
    counts: {
      campaigns: db.campaigns.length,
      contacts: db.contacts.length,
      calls: db.calls.length,
      findings: db.findings.length,
      reports: db.reports.length,
    },
    db: dbPath(),
  });
}
