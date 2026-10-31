import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { readDb } from "@/lib/store";
import { Badge, SeverityBadge, StatusBadge } from "@/components/ui";
import { formatDateTime, formatDuration, worstSeverity } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function CallsPage({
  searchParams,
}: {
  searchParams: Promise<{ campaign?: string }>;
}) {
  const { campaign: campaignFilter } = await searchParams;
  const db = await readDb();

  const calls = [...db.calls]
    .filter((call) => (campaignFilter ? call.campaignId === campaignFilter : true))
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));

  const campaignName = new Map(db.campaigns.map((entry) => [entry.id, entry.name]));
  const contactName = new Map(db.contacts.map((entry) => [entry.id, entry.name]));
  const findingsFor = (callId: string) => db.findings.filter((finding) => finding.callId === callId);

  const completed = db.calls.filter((call) => call.status === "completed").length;
  const critical = db.findings.filter(
    (finding) => finding.severity === "critical" && finding.status !== "dismissed",
  ).length;

  return (
    <div>
      <header className="simple-page-header">
        <div>
          <p className="simple-eyebrow">Audit trail</p>
          <h1>Calls</h1>
          <p>
            Every completed execution is audited. Open a call to read the transcript, hear the
            flagged moment and review the finding against its quote.
          </p>
        </div>
      </header>

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-[8px] border border-[#d8e5e8] bg-white px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[9px] uppercase tracking-[0.08em] text-[#7d9197]">
            Campaign:
          </span>
          <Link
            href="/calls"
            className="simple-secondary-button"
            style={
              !campaignFilter
                ? { borderColor: "#7fb9c2", color: "#0f6070", background: "#e6f3f6" }
                : undefined
            }
          >
            All ({db.calls.length})
          </Link>
          {db.campaigns.map((entry) => {
            const count = db.calls.filter((c) => c.campaignId === entry.id).length;
            return (
              <Link
                key={entry.id}
                href={`/calls?campaign=${entry.id}`}
                className="simple-secondary-button"
                style={
                  campaignFilter === entry.id
                    ? { borderColor: "#7fb9c2", color: "#0f6070", background: "#e6f3f6" }
                    : undefined
                }
              >
                {entry.name} ({count})
              </Link>
            );
          })}
        </div>
        <span className="font-mono text-[10px] text-[#7d9197]">
          Showing {calls.length} {calls.length === 1 ? "execution" : "executions"}
        </span>
      </div>

      <div className="simple-facts">
        <div>
          <span>Executions</span>
          <b>{db.calls.length}</b>
        </div>
        <div>
          <span>Completed &amp; audited</span>
          <b>{completed}</b>
        </div>
        <div>
          <span>Findings</span>
          <b>{db.findings.length}</b>
        </div>
        <div>
          <span>Critical</span>
          <b style={critical > 0 ? { color: "#a3463f" } : undefined}>{critical}</b>
        </div>
      </div>

      <div className="simple-feed">
        <div className="simple-call-head" aria-hidden="true">
          <span>Call</span>
          <span>Campaign</span>
          <span>Contact</span>
          <span>Findings</span>
          <span>Started</span>
          <span />
        </div>
        {calls.map((call) => {
          const findings = findingsFor(call.id);
          const worst = worstSeverity(findings.map((finding) => finding.severity));
          return (
            <Link key={call.id} href={`/calls/${call.id}`} className="simple-call-row">
              <div className="simple-payment-id">
                <b>{call.id}</b>
                <small>
                  {call.source} · {formatDuration(call.durationMs)}
                </small>
              </div>
              <div className="text-[11px] text-[#3f5b62]">
                {campaignName.get(call.campaignId) ?? call.campaignId}
              </div>
              <div className="text-[11px] text-[#657b81]">
                {call.contactId ? contactName.get(call.contactId) ?? call.contactId : "—"}
              </div>
              <div className="flex items-center gap-2">
                {worst ? (
                  <>
                    <SeverityBadge severity={worst} />
                    <span className="font-mono text-[10px] text-[#7d9197]">{findings.length}</span>
                  </>
                ) : (
                  <Badge tone="success">clear</Badge>
                )}
              </div>
              <div className="text-[10px] text-[#7d9197]">{formatDateTime(call.startedAt)}</div>
              <ArrowUpRight />
            </Link>
          );
        })}
        {calls.length === 0 ? (
          <div className="px-5 py-12 text-center text-[12px] text-[#657b81]">
            No calls match this filter. Reset the demo from the overview page or post a Bolna
            completion payload to <span className="font-mono text-[11px]">/api/webhooks/bolna</span>.
          </div>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3 text-[10px] text-[#7d9197]">
        <StatusBadge status="completed" />
        <span>Completed calls are audited automatically on webhook ingest.</span>
        <span className="font-mono">100% coverage · no sampling</span>
      </div>
    </div>
  );
}
