import Link from "next/link";
import { AlertTriangle, CheckCircle2, FlaskConical } from "lucide-react";
import { readDb } from "@/lib/store";
import { evaluateCalibration } from "@/lib/metrics";
import { evaluateGate } from "@/lib/gate";
import { CALIBRATION_LABELS, CALIBRATION_NOW, GATE_LABELS } from "@/lib/seed-data";
import { Badge, Bar } from "@/components/ui";
import { formatDateTime, formatPercent } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function MetricsPage() {
  const db = await readDb();
  const now = new Date(CALIBRATION_NOW);
  const calibration = evaluateCalibration({
    labels: CALIBRATION_LABELS,
    gateLabels: GATE_LABELS,
    findings: db.findings,
    contacts: db.contacts,
    campaigns: db.campaigns,
    rules: db.rules,
    now,
  });

  const mismatches = CALIBRATION_LABELS.map((label) => {
    const predicted = new Set(
      db.findings.filter((finding) => finding.callId === label.callId).map((f) => f.ruleCode),
    );
    const expected = new Set(label.expected);
    return {
      callId: label.callId,
      note: label.note,
      missing: [...expected].filter((code) => !predicted.has(code)),
      extra: [...predicted].filter((code) => !expected.has(code)),
    };
  }).filter((entry) => entry.missing.length > 0 || entry.extra.length > 0);

  const gateRows = GATE_LABELS.map((label) => {
    const contact = db.contacts.find((entry) => entry.id === label.contactId);
    const campaign = db.campaigns.find((entry) => entry.id === label.campaignId);
    const actual =
      contact && campaign
        ? evaluateGate({ contact, campaign, rules: db.rules, now }).decision
        : "missing";
    return {
      ...label,
      contactName: contact?.name ?? label.contactId,
      campaignName: campaign?.name ?? label.campaignId,
      actual,
      ok: actual === label.expected,
    };
  });

  const ruleTitle = new Map(db.rules.map((rule) => [rule.code, rule.title]));
  const truePositives = calibration.overall.truePositives;
  const predicted = truePositives + calibration.overall.falsePositives;

  return (
    <div>
      <header className="simple-page-header">
        <div>
          <p className="simple-eyebrow">Measurement</p>
          <h1>Calibration</h1>
          <p>
            {CALIBRATION_LABELS.length} synthetic calls we hand-labelled ourselves, and{" "}
            {GATE_LABELS.length} gate scenarios, evaluated by the same engine that audits production
            calls. Every number below is computed at request time from the labels in the repo — not
            typed into a slide.
          </p>
        </div>
        <span className="simple-data-badge">Self-labelled pilot</span>
      </header>

      <div
        className="simple-notice"
        style={{ color: "#a85a1c", background: "#fff7ed", borderColor: "#f0d2b6" }}
      >
        <span>
          These are synthetic transcripts labelled by the builder, not an independent benchmark. The
          labels, the code and the two misses are all in the repo.
        </span>
      </div>

      <section className="simple-summary-grid" aria-label="Calibration summary">
        <article className="simple-summary-main">
          <span>Post-call precision</span>
          <strong>{formatPercent(calibration.overall.precision)}</strong>
          <p>
            {truePositives} true positives, {calibration.overall.falsePositives} false positives
            against our hand labels.
          </p>
          <div className="simple-progress">
            <span>
              <b>{truePositives}</b> of {predicted} flags matched the hand labels
            </span>
            <i>
              <em style={{ width: "100%" }} />
            </i>
          </div>
        </article>
        <article className="simple-stat">
          <span>Post-call recall</span>
          <strong>{formatPercent(calibration.overall.recall)}</strong>
          <p>
            {calibration.overall.falseNegatives} known misses, left in the corpus on purpose. They
            are implied threats outside the lexicon.
          </p>
        </article>
        <article className="simple-stat">
          <span>Gate accuracy</span>
          <strong>{formatPercent(calibration.gate.accuracy)}</strong>
          <p>
            {calibration.gate.correct} of {calibration.gate.total} pre-dial scenarios, evaluated at a
            fixed clock.
          </p>
        </article>
      </section>

      <section className="simple-process-section">
        <div className="simple-section-title">
          <div>
            <p className="simple-eyebrow">Per-rule accuracy</p>
            <h2>Where the engine is strong, and where it is not.</h2>
            <p className="simple-section-copy">
              A prediction counts once per call. Recall is the number that matters for a compliance
              control.
            </p>
          </div>
        </div>

        <div className="simple-card overflow-hidden p-0">
          <table className="simple-table">
            <thead>
              <tr>
                <th>Rule</th>
                <th>Expected</th>
                <th>TP</th>
                <th>FP</th>
                <th>FN</th>
                <th>Precision</th>
                <th>Recall</th>
                <th style={{ width: 160 }}>Recall bar</th>
              </tr>
            </thead>
            <tbody>
              {calibration.perRule.map((score) => (
                <tr key={score.code}>
                  <td>
                    <div className="text-[11px] font-semibold text-[#1d353c]">{score.title}</div>
                    <div className="font-mono text-[9px] text-[#7d9197]">{score.code}</div>
                  </td>
                  <td>{score.expected}</td>
                  <td className="text-[#0f6b7a]">{score.truePositives}</td>
                  <td className="text-[#a3463f]">{score.falsePositives}</td>
                  <td className="text-[#ae611b]">{score.falseNegatives}</td>
                  <td>{formatPercent(score.precision)}</td>
                  <td>{formatPercent(score.recall)}</td>
                  <td style={{ width: 160 }}>
                    <Bar value={score.recall} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="mt-10 grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <section>
          <div className="simple-section-title">
            <div>
              <p className="simple-eyebrow">Error analysis</p>
              <h2>Every disagreement, in the open.</h2>
            </div>
            <span className="simple-data-badge sample">{mismatches.length} mismatch</span>
          </div>
          <div className="simple-card p-0">
            <div className="divide-y divide-[#eef5f6]">
              {mismatches.map((mismatch) => (
                <div key={mismatch.callId} className="px-5 py-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/calls/${mismatch.callId}`}
                      className="font-mono text-[11px] text-[#0f6070] hover:underline"
                    >
                      {mismatch.callId}
                    </Link>
                    {mismatch.missing.length > 0 ? <Badge tone="danger">missed</Badge> : null}
                    {mismatch.extra.length > 0 ? <Badge tone="warning">extra</Badge> : null}
                  </div>
                  <p className="mt-1.5 text-[11px] leading-relaxed text-[#657b81]">{mismatch.note}</p>
                  <div className="mt-2 space-y-1">
                    {mismatch.missing.map((code) => (
                      <div key={`missing-${code}`} className="flex items-center gap-2 text-[10px]">
                        <AlertTriangle className="h-3 w-3 text-[#c5544b]" />
                        <span className="text-[#7d9197]">expected</span>
                        <span className="text-[#3f5b62]">{ruleTitle.get(code) ?? code}</span>
                      </div>
                    ))}
                    {mismatch.extra.map((code) => (
                      <div key={`extra-${code}`} className="flex items-center gap-2 text-[10px]">
                        <AlertTriangle className="h-3 w-3 text-[#d77522]" />
                        <span className="text-[#7d9197]">predicted</span>
                        <span className="text-[#3f5b62]">{ruleTitle.get(code) ?? code}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {mismatches.length === 0 ? (
                <div className="px-5 py-10 text-center text-[11px] text-[#657b81]">
                  No mismatches on this corpus. That is a reason to build a harder corpus, not to
                  celebrate.
                </div>
              ) : null}
            </div>
          </div>
        </section>

        <div className="space-y-4">
          <section className="simple-card">
            <div className="simple-card-header">
              <div>
                <h2>Gate scenarios</h2>
                <p>Deterministic pre-dial decisions against fixed inputs.</p>
              </div>
              <span className="simple-data-badge">{calibration.gate.correct}/{calibration.gate.total}</span>
            </div>
            <div className="-mx-6 divide-y divide-[#eef5f6]">
              {gateRows.map((row) => (
                <div
                  key={`${row.contactId}-${row.campaignId}`}
                  className="flex items-center justify-between gap-3 px-6 py-2.5"
                >
                  <div className="min-w-0">
                    <div className="truncate text-[11px] text-[#2f4a51]">{row.contactName}</div>
                    <div className="truncate text-[10px] text-[#7d9197]">{row.campaignName}</div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className={`simple-status ${row.actual}`}>{row.actual}</span>
                    {row.ok ? (
                      <CheckCircle2 className="h-3 w-3 text-[#0f7a8a]" />
                    ) : (
                      <AlertTriangle className="h-3 w-3 text-[#c5544b]" />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="simple-card">
            <div className="flex items-center gap-2">
              <FlaskConical className="h-3.5 w-3.5 text-[#d77522]" />
              <p className="simple-card-label">Method</p>
            </div>
            <ul className="mt-2 space-y-1.5 text-[11px] leading-relaxed text-[#657b81]">
              <li>Labels were written by hand before the engine was tuned, and are in the repo.</li>
              <li>
                Evaluation time is fixed at {formatDateTime(CALIBRATION_NOW)} so gate results are
                stable.
              </li>
              <li>
                Engine:{" "}
                {(db.settings?.judgeMode ?? "heuristic") === "llm"
                  ? "LLM + deterministic scanners. LLM-mode calibration is not claimed here."
                  : "heuristic scanners. LLM-mode calibration is not claimed here."}
              </li>
              <li>
                {CALIBRATION_LABELS.length} labelled calls is a real pilot, not production
                accuracy. Target is 300+ with inter-annotator agreement.
              </li>
              <li>Known misses are implied threats the lexicon does not cover, left in on purpose.</li>
            </ul>
          </section>
        </div>
      </div>

      <footer className="mt-12 flex flex-wrap items-center justify-between gap-3 border-t border-[#d8e5e8] pt-5 text-[10px] text-[#7d9197]">
        <span>Critical findings arm the breaker; everything else goes to human review.</span>
        <Link href="/rules" className="text-[#0f6070] hover:underline">
          Read the policy →
        </Link>
      </footer>
    </div>
  );
}
