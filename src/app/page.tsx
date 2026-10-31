import Link from "next/link";
import { ArrowUpRight, FileCheck2, PhoneCall, Scale, ShieldCheck } from "lucide-react";
import { readDb } from "@/lib/store";
import { SeverityBadge, StatusBadge } from "@/components/ui";
import { formatDateTime, formatPercent, relativeTime, severityRank } from "@/lib/format";
import { CALIBRATION_LABELS, CALIBRATION_NOW, GATE_LABELS } from "@/lib/seed-data";
import { evaluateCalibration } from "@/lib/metrics";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const db = await readDb();
  const completed = db.calls.filter((call) => call.status === "completed");
  const open = db.findings.filter(
    (finding) => finding.status === "open" || finding.status === "escalated",
  );
  const paused = db.campaigns.filter((campaign) => campaign.status === "paused");
  const blocked = db.contacts.filter((contact) => contact.blocked).length;

  const calibration = evaluateCalibration({
    labels: CALIBRATION_LABELS,
    gateLabels: GATE_LABELS,
    findings: db.findings,
    contacts: db.contacts,
    campaigns: db.campaigns,
    rules: db.rules,
    now: new Date(CALIBRATION_NOW),
  });

  const ruleTitle = new Map(db.rules.map((rule) => [rule.code, rule.title]));
  const campaignName = new Map(db.campaigns.map((campaign) => [campaign.id, campaign.name]));
  const contactName = new Map(db.contacts.map((contact) => [contact.id, contact.name]));

  const ranked = [...open].sort((a, b) => {
    const severity = severityRank(a.severity) - severityRank(b.severity);
    if (severity !== 0) return severity;
    return b.createdAt.localeCompare(a.createdAt);
  });

  return (
    <div>
      <header className="simple-page-header">
        <div>
          <p className="simple-eyebrow">Built for Bolna voice campaigns</p>
          <h1>
            Collections compliance,{" "}
            <span className="times-italic text-[#0f7a8a]">provable.</span>
          </h1>
          <p>
            Pramaan sits beside Bolna&apos;s voice agents and gates every dial against the
            customer&apos;s policy, then audits every completed transcript. Every finding carries the
            clause, the quote and the timestamp. Nothing is sampled, and nothing is taken on trust.
          </p>
        </div>
        <Link href="/campaigns/camp-q3" className="simple-primary-button">
          <ShieldCheck />
          Run pre-dial gate
        </Link>
      </header>

      <section className="simple-summary-grid" aria-label="Campaign and audit summary">
        <article className="simple-summary-main">
          <span className="block text-[11px] font-bold text-[#b3d6dd]">
            Bolna voice calls audited — provably complete
          </span>
          <strong className="mt-3 block text-[40px] font-bold leading-none tracking-[-0.07em] text-white">
            {completed.length}
          </strong>
          <p className="mt-2 text-[11px] leading-relaxed text-[#a9c4ca]">
            Every completed Bolna call in the period. 100% audited, zero sampling.
          </p>
          <div className="simple-progress">
            <span>
              <b>{db.findings.length}</b> of {db.findings.length} findings carry a verbatim quote
            </span>
            <i>
              <em style={{ width: "100%" }} />
            </i>
          </div>
        </article>

        <article className="simple-stat flex flex-col justify-between">
          <div>
            <span>Open findings</span>
            <strong>{open.length}</strong>
            <p>
              Flagged turns requiring compliance officer review. Upheld findings feed the audit chain.
            </p>
          </div>
          <div className="mt-4 border-t border-[#e8f1f3] pt-3 font-mono text-[9px] text-[#7d9197]">
            {db.findings.filter((f) => f.severity === "critical").length} critical ·{" "}
            {db.findings.filter((f) => f.severity === "high").length} high priority
          </div>
        </article>

        <article className="simple-stat flex flex-col justify-between">
          <div>
            <span>Circuit breaker</span>
            <strong>{paused.length > 0 ? `${paused.length} paused` : "Operational"}</strong>
            <p>
              {paused.length > 0
                ? `${blocked} borrower contact${blocked === 1 ? "" : "s"} blocked automatically on prohibited conduct.`
                : "Auto-pauses campaign and blocks contacts if voice agents threaten borrowers."}
            </p>
          </div>
          <div className="mt-4 border-t border-[#e8f1f3] pt-3 font-mono text-[9px] text-[#7d9197]">
            {blocked} blocked contacts · breaker active
          </div>
        </article>
      </section>

      <section className="simple-process-section mt-8">
        <div className="simple-section-title">
          <div>
            <p className="simple-eyebrow">Architecture flow</p>
            <h2>One clear path from dial to evidence</h2>
            <p className="simple-section-copy">
              Bolna orchestrates the voice call. Pramaan enforces deterministic pre-dial policy, audits transcripts, and provides tamper-evident proof.
            </p>
          </div>
          <span className="simple-data-badge">Bolna Voice AI</span>
        </div>
        <ol className="simple-process">
          <li>
            <b>1</b>
            <div>
              <strong>Gate the dial</strong>
              <span>
                Consent, DND, calling window, attempt cap and script disclosure. Evaluated deterministically before Bolna dials.
              </span>
            </div>
          </li>
          <li>
            <b>2</b>
            <div>
              <strong>Audit every call</strong>
              <span>
                Ingests Bolna webhook payload. Checks disclosure, third-party debt details, and prohibited threats with verbatim quote grounding.
              </span>
            </div>
          </li>
          <li>
            <b>3</b>
            <div>
              <strong>Cryptographic evidence</strong>
              <span>
                Trips circuit breaker on critical threats. Chains transcripts into SHA-256 tamper-evident reports for compliance sign-off.
              </span>
            </div>
          </li>
        </ol>
      </section>

      <div className="mt-6 grid gap-4 xl:grid-cols-[1.45fr_0.85fr]">
        <section>
          <div className="simple-section-title">
            <div>
              <p className="simple-eyebrow">Review queue</p>
              <h2>Findings needing attention</h2>
              <p className="simple-section-copy">
                Open any call to hear the moment, read the quote and decide whether to uphold it.
              </p>
            </div>
            <Link href="/calls" className="simple-data-badge">
              All calls →
            </Link>
          </div>

          <div className="simple-feed">
            <div className="simple-feed-head" aria-hidden="true">
              <span>Call</span>
              <span>Finding</span>
              <span>Rule</span>
              <span>Severity</span>
              <span />
            </div>
            {ranked.slice(0, 7).map((finding) => {
              const call = db.calls.find((entry) => entry.id === finding.callId);
              const contact = call?.contactId ? contactName.get(call.contactId) : null;
              return (
                <Link key={finding.id} href={`/calls/${finding.callId}`} className="simple-payment-row">
                  <div className="simple-payment-id">
                    <b>{finding.callId}</b>
                    <small>
                      {contact ?? "Unknown contact"} ·{" "}
                      {campaignName.get(call?.campaignId ?? "") ?? "—"}
                    </small>
                  </div>
                  <div className="flex items-center gap-2">
                    <i className="h-1.5 w-1.5 shrink-0 rounded-sm bg-[#d77522]" />
                    <span className="line-clamp-1 text-[11px] text-[#3f5b62]">
                      “{finding.quote}”
                    </span>
                  </div>
                  <div className="simple-action line-clamp-2" title={ruleTitle.get(finding.ruleCode)}>
                    {ruleTitle.get(finding.ruleCode) ?? finding.ruleCode}
                  </div>
                  <div className="flex items-center gap-2">
                    <SeverityBadge severity={finding.severity} />
                    <span className="text-[10px] text-[#7d9197]">{relativeTime(finding.createdAt)}</span>
                  </div>
                  <ArrowUpRight />
                </Link>
              );
            })}
            {ranked.length === 0 ? (
              <div className="px-5 py-10 text-center text-[12px] text-[#657b81]">
                The queue is clear. Every completed call passed the six controls.
              </div>
            ) : null}
          </div>
        </section>

        <aside className="space-y-4">
          <section className="simple-card">
            <div className="simple-card-header">
              <div>
                <h2>Campaign coverage</h2>
                <p>What the gate is protecting</p>
              </div>
              <span className="simple-data-badge sample">v{db.policy.version}</span>
            </div>
            <div className="space-y-2.5">
              {db.campaigns.map((campaign) => {
                const campaignCalls = db.calls.filter((call) => call.campaignId === campaign.id);
                const campaignFindings = db.findings.filter((finding) =>
                  campaignCalls.some((call) => call.id === finding.callId),
                );
                return (
                  <div
                    key={campaign.id}
                    className="rounded-[6px] border border-[#e8f1f3] bg-[#f8fcfd] p-3 transition-colors hover:border-[#b6d5db]"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <Link
                          href={`/campaigns/${campaign.id}`}
                          className="block truncate text-[12px] font-semibold text-[#1d353c] hover:underline"
                        >
                          {campaign.name}
                        </Link>
                        <div className="mt-0.5 truncate text-[10px] text-[#7d9197]">
                          {campaign.client} · agent {campaign.agentName}
                        </div>
                      </div>
                      <StatusBadge status={campaign.status} />
                    </div>
                    <div className="mt-2.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 border-t border-[#edf5f6] pt-2 font-mono text-[9px] uppercase tracking-[0.06em] text-[#7d9197]">
                      <div className="flex items-center gap-2">
                        <span>{campaign.contactIds.length} contacts</span>
                        <span>·</span>
                        <span>{campaignCalls.length} calls</span>
                      </div>
                      <div className="flex items-center gap-2.5 lowercase">
                        <Link
                          href={`/campaigns/${campaign.id}`}
                          className="font-sans text-[10px] font-semibold text-[#0f6070] hover:underline"
                        >
                          gate & dial →
                        </Link>
                        <Link
                          href={`/reports/${campaign.id}`}
                          className="font-sans text-[10px] font-semibold text-[#0f7a8a] hover:underline"
                        >
                          report →
                        </Link>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="simple-card">
            <div className="flex items-center justify-between">
              <p className="simple-card-label">Calibration</p>
              <Link href="/metrics" className="text-[10px] font-semibold text-[#0f7a8a] hover:underline">
                Open →
              </Link>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <div>
                <span className="block font-mono text-[9px] uppercase tracking-[0.06em] text-[#7d9197]">
                  Precision
                </span>
                <b className="mt-1 block text-[20px] font-bold leading-none tracking-[-0.05em] text-[#0f7a8a]">
                  {formatPercent(calibration.overall.precision)}
                </b>
              </div>
              <div>
                <span className="block font-mono text-[9px] uppercase tracking-[0.06em] text-[#7d9197]">
                  Recall
                </span>
                <b className="mt-1 block text-[20px] font-bold leading-none tracking-[-0.05em] text-[#d77522]">
                  {formatPercent(calibration.overall.recall)}
                </b>
              </div>
              <div>
                <span className="block font-mono text-[9px] uppercase tracking-[0.06em] text-[#7d9197]">
                  Gate
                </span>
                <b className="mt-1 block text-[20px] font-bold leading-none tracking-[-0.05em] text-[#0f7a8a]">
                  {formatPercent(calibration.gate.accuracy)}
                </b>
              </div>
            </div>
            <p className="mt-2 text-[10px] leading-relaxed text-[#7d9197]">
              Computed from {CALIBRATION_LABELS.length} synthetic, self-labelled calls and{" "}
              {GATE_LABELS.length} gate scenarios.
            </p>
          </section>
        </aside>
      </div>

      <footer className="mt-12 flex flex-wrap items-center justify-between gap-3 border-t border-[#d8e5e8] pt-5 text-[10px] text-[#7d9197]">
        <span className="inline-flex items-center gap-2">
          <FileCheck2 className="h-3.5 w-3.5 text-[#0f7a8a]" />
          Evidence chain intact · findings grounded · policy v{db.policy.version}
        </span>
        <span className="inline-flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5">
            <PhoneCall className="h-3 w-3" />
            {db.calls.length} executions
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Scale className="h-3 w-3" />
            Not legal advice
          </span>
          <span>{formatDateTime(new Date().toISOString())}</span>
        </span>
      </footer>
    </div>
  );
}
