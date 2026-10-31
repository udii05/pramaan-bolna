import Link from "next/link";
import { ArrowUpRight, ShieldCheck } from "lucide-react";
import { readDb } from "@/lib/store";
import { Badge, SeverityBadge, StatusBadge } from "@/components/ui";
import { formatDateTime, worstSeverity } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function CampaignsPage() {
  const db = await readDb();
  const active = db.campaigns.filter((campaign) => campaign.status === "active").length;
  const paused = db.campaigns.filter((campaign) => campaign.status === "paused").length;
  const completed = db.calls.filter((call) => call.status === "completed").length;

  return (
    <div>
      <header className="simple-page-header">
        <div>
          <p className="simple-eyebrow">Operations</p>
          <h1>Campaigns</h1>
          <p>
            Each campaign carries its own opening script, contact eligibility and audit coverage.
            The gate blocks the dial; the breaker pauses the campaign when a critical finding lands.
          </p>
        </div>
        <Link href="/campaigns/camp-q3" className="simple-primary-button">
          <ShieldCheck />
          Open Q3 campaign
        </Link>
      </header>

      <section className="simple-summary-grid" aria-label="Campaign summary">
        <article className="simple-summary-main">
          <span>Campaigns under gate</span>
          <strong>{db.campaigns.length}</strong>
          <p>{db.contacts.length} contacts screened before every dial. No model in the path.</p>
          <div className="simple-progress">
            <span>
              <b>{completed}</b> completed calls audited across every campaign
            </span>
            <i>
              <em style={{ width: "100%" }} />
            </i>
          </div>
        </article>
        <article className="simple-stat">
          <span>Active</span>
          <strong>{active}</strong>
          <p>Campaigns currently allowed to dial inside the policy window.</p>
        </article>
        <article className="simple-stat">
          <span>Paused by breaker</span>
          <strong>{paused}</strong>
          <p>
            {paused > 0
              ? "A critical conduct finding paused the campaign and blocked the contact."
              : "No campaign is paused."}
          </p>
        </article>
      </section>

      <section className="simple-process-section">
        <div className="simple-section-title">
          <div>
            <p className="simple-eyebrow">Coverage</p>
            <h2>Every campaign, every completed call.</h2>
          </div>
          <span className="simple-data-badge">Live data</span>
        </div>

        <div className="simple-feed">
          <div
            className="simple-feed-head"
            style={{ gridTemplateColumns: "1.5fr .8fr .55fr .55fr .65fr .55fr 18px" }}
            aria-hidden="true"
          >
            <span>Campaign</span>
            <span>Status</span>
            <span>Contacts</span>
            <span>Calls</span>
            <span>Findings</span>
            <span>Worst</span>
            <span />
          </div>
          {db.campaigns.map((campaign) => {
            const calls = db.calls.filter((call) => call.campaignId === campaign.id);
            const findings = db.findings.filter((finding) =>
              calls.some((call) => call.id === finding.callId),
            );
            const worst = worstSeverity(findings.map((finding) => finding.severity));
            const lastCall = [...calls].sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
            return (
              <Link
                key={campaign.id}
                href={`/campaigns/${campaign.id}`}
                className="simple-payment-row"
                style={{ gridTemplateColumns: "1.5fr .8fr .55fr .55fr .65fr .55fr 18px" }}
              >
                <div className="simple-payment-id">
                  <b>{campaign.name}</b>
                  <small>
                    {campaign.client} · agent {campaign.agentName}
                    {lastCall ? ` · last call ${formatDateTime(lastCall.startedAt)}` : ""}
                  </small>
                </div>
                <StatusBadge status={campaign.status} />
                <div className="simple-cause">{campaign.contactIds.length}</div>
                <div className="simple-cause">{calls.length}</div>
                <div className="simple-cause">{findings.length}</div>
                <div>
                  {worst ? <SeverityBadge severity={worst} /> : <Badge tone="success">clear</Badge>}
                </div>
                <ArrowUpRight />
              </Link>
            );
          })}
        </div>

        {db.campaigns.some((campaign) => campaign.pauseReason) ? (
          <div className="simple-notice error mt-4">
            <ShieldCheck className="h-4 w-4" />
            {db.campaigns.find((campaign) => campaign.pauseReason)?.pauseReason}
          </div>
        ) : null}
      </section>

      <section className="simple-process-section">
        <div className="simple-section-title">
          <div>
            <p className="simple-eyebrow">What happens on a block</p>
            <h2>A block is a decision, not an error.</h2>
          </div>
        </div>
        <ol className="simple-process">
          <li>
            <b>1</b>
            <div>
              <strong>Hard denial</strong>
              <span>Consent missing, DND listed, attempt cap reached or script disclosure absent.</span>
            </div>
          </li>
          <li>
            <b>2</b>
            <div>
              <strong>Reschedule</strong>
              <span>
                Outside the recipient&apos;s local calling window. The gate names the next allowed
                hour instead of dropping the contact.
              </span>
            </div>
          </li>
          <li>
            <b>3</b>
            <div>
              <strong>Breaker</strong>
              <span>
                A critical post-call finding pauses the campaign and blocks the contact until a
                reviewer clears it.
              </span>
            </div>
          </li>
        </ol>
      </section>
    </div>
  );
}
