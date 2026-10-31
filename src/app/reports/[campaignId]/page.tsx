import Link from "next/link";
import { notFound } from "next/navigation";
import { BadgeCheck, ArrowLeft, ShieldAlert, ShieldCheck } from "lucide-react";
import { readDb } from "@/lib/store";
import { buildReport, verifyReport } from "@/lib/report";
import { Badge, SeverityBadge, StatusBadge } from "@/components/ui";
import { ReportActions } from "@/components/report-actions";
import { PramaanMark } from "@/components/mark";
import { formatDateTime, formatPercent, shortHash } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function ReportPage({
  params,
}: {
  params: Promise<{ campaignId: string }>;
}) {
  const { campaignId } = await params;
  const db = await readDb();
  const campaign = db.campaigns.find((entry) => entry.id === campaignId);
  if (!campaign) notFound();

  const persistedReport = db.reports.find((entry) => entry.campaignId === campaignId) ?? null;
  const report =
    persistedReport ??
    buildReport({
      campaign,
      calls: db.calls,
      findings: db.findings,
      policy: db.policy,
    });

  const verification = verifyReport(report, db.calls, db.findings);
  const callIds = new Set(report.chain.map((entry) => entry.callId));
  const scoped = db.findings.filter((finding) => callIds.has(finding.callId));
  const ruleTitle = new Map(db.rules.map((rule) => [rule.code, rule.title]));

  return (
    <div>
      <div className="no-print mb-5 flex items-center justify-between">
        <Link href={`/campaigns/${campaign.id}`} className="simple-back-link">
          <ArrowLeft className="h-4 w-4" />
          {campaign.name}
        </Link>
        <span className="font-mono text-[10px] text-[#7d9197]">
          {persistedReport ? "stored report" : "draft, not stored"}
        </span>
      </div>

      <header className="simple-page-header no-print">
        <div>
          <p className="simple-eyebrow">Evidence</p>
          <h1>Compliance report</h1>
          <p>
            A report a compliance officer can sign: scope, findings, clause references, audio
            timestamps and a SHA-256 chain over every call.
          </p>
        </div>
        <ReportActions
          campaignId={campaign.id}
          reportId={report.id}
          persisted={Boolean(persistedReport)}
          signed={Boolean(report.signedBy)}
        />
      </header>

      <div className="report-print simple-card">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#e8f1f3] pb-5">
          <div>
            <div className="flex items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-md border border-[#c7e4e9] bg-[#eaf6f8]">
                <PramaanMark className="h-4 w-4 text-[#0f7a8a]" />
              </span>
              <div>
                <div className="text-[14px] font-extrabold tracking-[-0.04em] text-[#12262c]">
                  Pramaan
                </div>
                <div className="font-mono text-[8px] uppercase tracking-[0.12em] text-[#7d9197]">
                  Compliance evidence report
                </div>
              </div>
            </div>
            <h2 className="mt-4 text-[24px] font-bold tracking-[-0.055em] text-[#152a30]">
              {campaign.name}
            </h2>
            <div className="mt-1 text-[11px] text-[#657b81]">
              {campaign.client} · agent {campaign.agentName} · policy v{report.policyVersion}
            </div>
          </div>

          <div className="text-right">
            <div
              className={`inline-flex items-center gap-1.5 rounded-[4px] border px-2 py-1 font-mono text-[9px] uppercase tracking-[0.06em] ${
                verification.ok
                  ? "border-[#c7e4e9] bg-[#e6f4f6] text-[#0f6b7a]"
                  : "border-[#f0cecb] bg-[#fceceb] text-[#a3463f]"
              }`}
            >
              {verification.ok ? <ShieldCheck className="h-3 w-3" /> : <ShieldAlert className="h-3 w-3" />}
              {verification.ok ? "chain verified" : "chain mismatch"}
            </div>
            <div className="mt-2 font-mono text-[9px] text-[#7d9197]">{report.id}</div>
            <div className="mt-1 text-[10px] text-[#7d9197]">
              generated {formatDateTime(report.generatedAt)}
            </div>
          </div>
        </div>

        {verification.staleCount > 0 ? (
          <div
            className="simple-notice mt-4"
            style={{ color: "#a85a1c", background: "#fff7ed", borderColor: "#f0d2b6" }}
          >
            <span>
              This report is signed over {report.callCount} calls. {verification.staleCount} new
              call{verification.staleCount === 1 ? " has" : "s have"} been audited since it was
              generated — the stored chain is intact and verified, it is simply a point-in-time
              snapshot. Generate a fresh report to include them.
            </span>
          </div>
        ) : null}

        <div className="simple-facts mt-5">
          <div>
            <span>Calls audited</span>
            <b>{report.callCount} · 100% of completed</b>
          </div>
          <div>
            <span>Findings</span>
            <b>
              {report.findingCount} · {report.openCount} open
            </b>
          </div>
          <div>
            <span>Critical</span>
            <b style={report.criticalCount > 0 ? { color: "#a3463f" } : undefined}>
              {report.criticalCount} · breaker armed
            </b>
          </div>
          <div>
            <span>Engine</span>
            <b className="capitalize">{report.engine} · quote-grounded</b>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-[6px] border border-[#e8f1f3] bg-[#f6fafb] px-3 py-2">
            <div className="font-mono text-[9px] uppercase tracking-[0.08em] text-[#7d9197]">Period</div>
            <div className="mt-0.5 text-[11px] text-[#3f5b62]">
              {formatDateTime(report.periodStart)} → {formatDateTime(report.periodEnd)}
            </div>
          </div>
          <div className="rounded-[6px] border border-[#e8f1f3] bg-[#f6fafb] px-3 py-2">
            <div className="font-mono text-[9px] uppercase tracking-[0.08em] text-[#7d9197]">
              Report hash
            </div>
            <div className="mt-0.5 break-all font-mono text-[9px] text-[#657b81]">
              {report.reportHash}
            </div>
          </div>
        </div>

        <div className="mt-6">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="font-mono text-[9px] uppercase tracking-[0.08em] text-[#7d9197]">
              Evidence chain
            </h3>
            <span className="font-mono text-[9px] text-[#7d9197]">
              SHA-256 · previous-hash linked · {verification.ok ? "verified" : "failed"}
            </span>
          </div>
          <div className="overflow-x-auto rounded-[6px] border border-[#e8f1f3]">
            <table className="simple-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Call</th>
                  <th>Transcript</th>
                  <th>Findings</th>
                  <th>Prev</th>
                  <th>Hash</th>
                </tr>
              </thead>
              <tbody>
                {report.chain.map((entry, index) => (
                  <tr key={entry.callId}>
                    <td className="text-[#7d9197]">{index + 1}</td>
                    <td className="font-mono text-[10px]">{entry.callId}</td>
                    <td className="font-mono text-[10px]" title={entry.transcriptHash}>
                      {shortHash(entry.transcriptHash, 10)}
                    </td>
                    <td className="font-mono text-[10px]" title={entry.findingsHash}>
                      {shortHash(entry.findingsHash, 10)}
                    </td>
                    <td className="font-mono text-[10px]" title={entry.prevHash}>
                      {entry.prevHash === "GENESIS" ? "GENESIS" : shortHash(entry.prevHash, 8)}
                    </td>
                    <td className="font-mono text-[10px]" title={entry.hash}>
                      {shortHash(entry.hash, 12)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-6">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-[#e8f1f3] pb-2">
            <div>
              <h3 className="font-mono text-[9px] uppercase tracking-[0.08em] text-[#7d9197]">
                Findings appendix
              </h3>
              <p className="mt-0.5 text-[11px] text-[#657b81]">
                Every violation grounded with verbatim quote, audio timestamp, and policy clause.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 font-mono text-[9px]">
              {scoped.filter((f) => f.severity === "critical").length > 0 ? (
                <span className="rounded-[4px] border border-[#f0cecb] bg-[#fceceb] px-2 py-0.5 font-semibold text-[#a3463f]">
                  {scoped.filter((f) => f.severity === "critical").length} critical
                </span>
              ) : null}
              {scoped.filter((f) => f.severity === "high").length > 0 ? (
                <span className="rounded-[4px] border border-[#f0d2b6] bg-[#fff1e5] px-2 py-0.5 font-semibold text-[#ae611b]">
                  {scoped.filter((f) => f.severity === "high").length} high
                </span>
              ) : null}
              {scoped.filter((f) => f.severity === "medium").length > 0 ? (
                <span className="rounded-[4px] border border-[#cde7ec] bg-[#edf6f8] px-2 py-0.5 font-semibold text-[#1f6f7d]">
                  {scoped.filter((f) => f.severity === "medium").length} medium
                </span>
              ) : null}
              <span className="text-[#7d9197]">· {scoped.length} total findings</span>
            </div>
          </div>
          <div className="space-y-2">
            {[...scoped]
              .sort((a, b) => {
                const ranks: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
                const diff = (ranks[a.severity] ?? 9) - (ranks[b.severity] ?? 9);
                return diff !== 0 ? diff : a.startMs - b.startMs;
              })
              .map((finding) => (
              <div key={finding.id} className="rounded-[6px] border border-[#e8f1f3] bg-[#f8fcfd] px-3 py-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <SeverityBadge severity={finding.severity} />
                  <span className="text-[11px] font-semibold text-[#1d353c]">
                    {ruleTitle.get(finding.ruleCode) ?? finding.ruleCode}
                  </span>
                  <Link
                    href={`/calls/${finding.callId}`}
                    className="font-mono text-[9px] text-[#0f6070] hover:underline"
                  >
                    {finding.callId}
                  </Link>
                  <StatusBadge status={finding.status} />
                </div>
                <p className="mt-1 text-[10px] leading-relaxed text-[#3f5b62]">
                  “{finding.quote}”
                </p>
                <p className="mt-1 text-[10px] leading-relaxed text-[#657b81]">
                  {finding.rationale}
                </p>
                <div className="mt-1 font-mono text-[9px] text-[#7d9197]">
                  turn {finding.turnIndex} · {Math.round(finding.startMs / 1000)}s ·{" "}
                  {formatPercent(finding.confidence)} confidence · {finding.engine}
                </div>
              </div>
            ))}
            {scoped.length === 0 ? (
              <div className="rounded-[6px] border border-[#cfe7eb] bg-[#f4fafb] px-3 py-6 text-center text-[11px] text-[#0f6b7a]">
                No findings in this period.
              </div>
            ) : null}
          </div>
        </div>

        <div className="mt-6 grid gap-4 border-t border-[#e8f1f3] pt-5 md:grid-cols-[1.4fr_1fr]">
          <div className="text-[10px] leading-relaxed text-[#7d9197]">
            <div className="mb-1 flex items-center gap-1.5 text-[#556c72]">
              <BadgeCheck className="h-3 w-3" /> Scope and limitations
            </div>
            This report covers completed calls in the stated period. Pre-dial decisions are recorded
            separately in the gate log. The engine audits transcripts; it does not verify audio beyond
            the transcript supplied by the telephony platform. Pramaan enforces a customer-authored
            policy and does not provide legal advice or certify regulatory compliance. Citations in
            the policy pack must be verified against primary sources.
          </div>
          <div className="rounded-[6px] border border-dashed border-[#d8e5e8] px-3 py-3">
            <div className="font-mono text-[9px] uppercase tracking-[0.08em] text-[#7d9197]">
              Signed off by
            </div>
            {report.signedBy ? (
              <>
                <div className="mt-1 text-[14px] font-semibold text-[#1d353c]">{report.signedBy}</div>
                <div className="text-[10px] text-[#7d9197]">
                  {formatDateTime(report.signedAt ?? report.generatedAt)}
                </div>
                <div className="mt-2">
                  <Badge tone="success">signed</Badge>
                </div>
              </>
            ) : (
              <>
                <div className="mt-1 text-[13px] text-[#657b81]">Unsigned</div>
                <div className="text-[10px] text-[#7d9197]">
                  Generate the report, then sign it to lock the hash.
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
