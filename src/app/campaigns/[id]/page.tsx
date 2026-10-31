import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowUpRight, FileText, ShieldCheck } from "lucide-react";
import { readDb } from "@/lib/store";
import { Badge, SeverityBadge, StatusBadge } from "@/components/ui";
import { BreakerControls } from "@/components/breaker-controls";
import { GateConsole } from "@/components/gate-console";
import { bolnaConfigured } from "@/lib/bolna";
import { formatDateTime, formatDuration, worstSeverity } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function CampaignPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const db = await readDb();
  const campaign = db.campaigns.find((entry) => entry.id === id);
  if (!campaign) notFound();

  const contacts = db.contacts.filter((contact) => campaign.contactIds.includes(contact.id));
  const calls = db.calls
    .filter((call) => call.campaignId === campaign.id)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  const callIds = new Set(calls.map((call) => call.id));
  const findings = db.findings.filter((finding) => callIds.has(finding.callId));
  const open = findings.filter(
    (finding) => finding.status === "open" || finding.status === "escalated",
  );
  const critical = findings.filter(
    (finding) => finding.severity === "critical" && finding.status !== "dismissed",
  );
  const blockedContacts = contacts.filter((contact) => contact.blocked);
  const breakerEvents = db.events
    .filter((event) => event.campaignId === campaign.id && event.type === "breaker")
    .slice(-2)
    .reverse();

  const scriptRule = db.rules.find((rule) => rule.code === "AI_DISCLOSURE_IN_SCRIPT");
  const patterns = ((scriptRule?.config.requiredAny as string[] | undefined) ?? []).map(
    (pattern) => new RegExp(pattern, "i"),
  );
  const scriptOk = patterns.some((pattern) => pattern.test(campaign.script));

  const now = Date.now();
  const gateContacts = contacts.map((contact) => ({
    id: contact.id,
    name: contact.name,
    phoneMasked: contact.phoneMasked,
    consentStatus: contact.consentStatus,
    dndStatus: contact.dndStatus,
    attempts24h: contact.attempts.filter((at) => now - new Date(at).getTime() <= 86_400_000).length,
    blocked: contact.blocked,
  }));

  const ruleTitle = new Map(db.rules.map((rule) => [rule.code, rule.title]));
  const contactName = new Map(contacts.map((contact) => [contact.id, contact.name]));

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <Link href="/campaigns" className="simple-back-link">
          <ArrowLeft className="h-4 w-4" />
          Campaigns
        </Link>
        <span className="font-mono text-[10px] text-[#7d9197]">{campaign.id}</span>
      </div>

      <header className="simple-page-header">
        <div>
          <p className="simple-eyebrow">Campaign</p>
          <div className="flex flex-wrap items-center gap-2">
            <h1>{campaign.name}</h1>
            <StatusBadge status={campaign.status} />
          </div>
          <p>
            {campaign.client} · agent {campaign.agentName} · created{" "}
            {formatDateTime(campaign.createdAt)}. The gate runs before every dial; the audit runs on
            every completed transcript.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/rules" className="simple-secondary-button">
            <ShieldCheck className="h-3.5 w-3.5" />
            Policy pack
            <ArrowUpRight className="h-3 w-3" />
          </Link>
          <Link href={`/reports/${campaign.id}`} className="simple-primary-button">
            <FileText />
            Open report
          </Link>
        </div>
      </header>

      {campaign.pauseReason ? (
        <div className="simple-notice error">
          <ShieldCheck className="h-4 w-4" />
          <span>
            <strong>Circuit breaker.</strong> {campaign.pauseReason}
          </span>
        </div>
      ) : null}

      {campaign.status === "active" && critical.length > 0 ? (
        <div
          className="simple-notice"
          style={{ color: "#a85a1c", background: "#fff7ed", borderColor: "#f0d2b6" }}
        >
          <ShieldCheck className="h-4 w-4" />
          <span>
            <strong>Resumed after review.</strong> {blockedContacts.length} contacts remain blocked
            after critical findings; the rest of the list continues.
          </span>
        </div>
      ) : null}

      <div className="simple-facts">
        <div>
          <span>Contacts</span>
          <b>
            {contacts.length} · {blockedContacts.length} blocked
          </b>
        </div>
        <div>
          <span>Calls audited</span>
          <b>
            {calls.filter((call) => call.status === "completed").length} completed
          </b>
        </div>
        <div>
          <span>Open findings</span>
          <b>{open.length}</b>
        </div>
        <div>
          <span>Critical</span>
          <b style={critical.length > 0 ? { color: "#a3463f" } : undefined}>{critical.length}</b>
        </div>
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[1.55fr_1fr]">
        <GateConsole campaignId={campaign.id} contacts={gateContacts} bolnaConfigured={bolnaConfigured()} />

        <div className="space-y-4">
          <section className="simple-card">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="simple-card-label">Circuit breaker</p>
                <div className="mt-2 text-[15px] font-semibold text-[#1d353c]">
                  {campaign.status === "paused" ? "Campaign is paused" : "Campaign is live"}
                </div>
              </div>
              <StatusBadge status={campaign.status} />
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-[#657b81]">
              A critical post-call finding pauses the campaign and blocks the contact automatically.
              Pausing does not cancel calls already in flight.
            </p>
            <div className="mt-4">
              <BreakerControls campaignId={campaign.id} status={campaign.status} />
            </div>
            {breakerEvents.length > 0 ? (
              <div className="mt-3 space-y-1.5 border-t border-[#e8f1f3] pt-3">
                {breakerEvents.map((event) => (
                  <p key={event.id} className="text-[10px] leading-relaxed text-[#7d9197]">
                    <span className="font-mono text-[9px] text-[#96aab0]">
                      {formatDateTime(event.at)}
                    </span>{" "}
                    · {event.message}
                  </p>
                ))}
              </div>
            ) : null}
          </section>

          <section className="simple-card">
            <div className="flex items-start justify-between gap-2">
              <p className="simple-card-label">Opening script</p>
              <Badge tone={scriptOk ? "success" : "danger"}>
                {scriptOk ? "disclosure present" : "no disclosure"}
              </Badge>
            </div>
            <p className="mt-3 rounded-[6px] border border-[#e8f1f3] bg-[#f6fafb] px-3 py-2.5 text-[11px] leading-relaxed text-[#3f5b62]">
              “{campaign.script}”
            </p>
            <p className="mt-2 text-[10px] leading-relaxed text-[#7d9197]">
              The gate blocks the campaign if the script loses its AI disclosure. The post-call audit
              separately checks whether the line was actually spoken.
            </p>
          </section>
        </div>
      </div>

      <section className="simple-process-section">
        <div className="simple-section-title">
          <div>
            <p className="simple-eyebrow">Eligibility inputs</p>
            <h2>Contacts</h2>
            <p className="simple-section-copy">
              Numbers are masked; matching uses a hash. The gate reads consent, DND and attempt
              history before every dial.
            </p>
          </div>
          <span className="simple-data-badge">Live data</span>
        </div>

        <div className="simple-card overflow-hidden p-0">
          <table className="simple-table">
            <thead>
              <tr>
                <th>Contact</th>
                <th>Number</th>
                <th>Consent</th>
                <th>DND</th>
                <th>Attempts 24h</th>
                <th>Blocked</th>
                <th>Timezone</th>
              </tr>
            </thead>
            <tbody>
              {contacts.map((contact) => (
                <tr key={contact.id}>
                  <td className="font-medium text-[#1d353c]">{contact.name}</td>
                  <td className="font-mono text-[10px]">{contact.phoneMasked}</td>
                  <td>
                    <Badge tone={contact.consentStatus === "granted" ? "success" : "danger"}>
                      {contact.consentStatus}
                    </Badge>
                  </td>
                  <td>
                    <Badge tone={contact.dndStatus === "clean" ? "success" : "danger"}>
                      {contact.dndStatus}
                    </Badge>
                  </td>
                  <td>
                    {contact.attempts.filter((at) => now - new Date(at).getTime() <= 86_400_000).length}
                  </td>
                  <td>
                    {contact.blocked ? <Badge tone="danger">blocked</Badge> : <span className="text-[#96aab0]">—</span>}
                  </td>
                  <td className="font-mono text-[10px]">{contact.timeZone}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="mt-10 grid gap-4 xl:grid-cols-[1.55fr_1fr]">
        <section>
          <div className="simple-section-title">
            <div>
              <p className="simple-eyebrow">Executions</p>
              <h2>Calls</h2>
            </div>
            <Link href={`/calls?campaign=${campaign.id}`} className="simple-data-badge">
              Open in calls →
            </Link>
          </div>
          <div className="simple-feed">
            <div className="simple-call-head" aria-hidden="true">
              <span>Call</span>
              <span>Contact</span>
              <span>Started</span>
              <span>Findings</span>
              <span>Duration</span>
              <span />
            </div>
            {calls.map((call) => {
              const callFindings = db.findings.filter((finding) => finding.callId === call.id);
              const worst = worstSeverity(callFindings.map((finding) => finding.severity));
              return (
                <Link key={call.id} href={`/calls/${call.id}`} className="simple-call-row">
                  <div className="simple-payment-id">
                    <b>{call.id}</b>
                    <small>{call.engine ?? "not audited"}</small>
                  </div>
                  <div className="text-[11px] text-[#657b81]">
                    {call.contactId ? contactName.get(call.contactId) ?? call.contactId : "—"}
                  </div>
                  <div className="text-[10px] text-[#7d9197]">{formatDateTime(call.startedAt)}</div>
                  <div>
                    {worst ? <SeverityBadge severity={worst} /> : <Badge tone="success">clear</Badge>}
                  </div>
                  <div className="font-mono text-[10px] text-[#7d9197]">
                    {formatDuration(call.durationMs)}
                  </div>
                  <ArrowUpRight />
                </Link>
              );
            })}
          </div>
        </section>

        <section>
          <div className="simple-section-title">
            <div>
              <p className="simple-eyebrow">Review</p>
              <h2>Findings</h2>
            </div>
            <span className="simple-data-badge sample">{findings.length} total</span>
          </div>
          <div className="simple-feed">
            {findings.slice(0, 8).map((finding) => (
              <Link key={finding.id} href={`/calls/${finding.callId}`} className="simple-payment-row" style={{ gridTemplateColumns: "1.4fr .9fr .6fr 18px" }}>
                <div className="simple-payment-id">
                  <b>{ruleTitle.get(finding.ruleCode) ?? finding.ruleCode}</b>
                  <small className="line-clamp-1">“{finding.quote}”</small>
                </div>
                <StatusBadge status={finding.status} />
                <SeverityBadge severity={finding.severity} />
                <ArrowUpRight />
              </Link>
            ))}
            {findings.length === 0 ? (
              <div className="px-5 py-10 text-center text-[12px] text-[#657b81]">
                No findings for this campaign.
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}
