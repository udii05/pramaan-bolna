import type { CallRecord, Campaign, ChainEntry, Finding, Policy, Report } from "./types";
import { hashFindings, hashJson, hashTranscript } from "./hash";

export interface BuildReportInput {
  campaign: Campaign;
  calls: CallRecord[];
  findings: Finding[];
  policy: Policy;
  now?: Date;
}

function engineFor(calls: CallRecord[]): string {
  const engines = new Set(calls.map((call) => call.engine).filter(Boolean));
  if (engines.size === 0) return "none";
  if (engines.size === 1) return Array.from(engines)[0] as string;
  return "mixed";
}

function buildChain(calls: CallRecord[], findings: Finding[]): ChainEntry[] {
  const ordered = [...calls].sort((a, b) =>
    `${a.startedAt}:${a.id}`.localeCompare(`${b.startedAt}:${b.id}`),
  );
  let prevHash = "GENESIS";
  const chain: ChainEntry[] = [];
  for (const call of ordered) {
    const callFindings = findings.filter((finding) => finding.callId === call.id);
    const entry: ChainEntry = {
      callId: call.id,
      transcriptHash: hashTranscript(call.turns),
      findingsHash: hashFindings(callFindings),
      prevHash,
      hash: "",
    };
    entry.hash = hashJson({
      callId: entry.callId,
      transcriptHash: entry.transcriptHash,
      findingsHash: entry.findingsHash,
      prevHash: entry.prevHash,
    });
    prevHash = entry.hash;
    chain.push(entry);
  }
  return chain;
}

function digest(report: Omit<Report, "reportHash"> & { reportHash?: string }): string {
  const lastHash = report.chain.length > 0 ? report.chain[report.chain.length - 1].hash : "GENESIS";
  return hashJson({
    campaignId: report.campaignId,
    periodStart: report.periodStart,
    periodEnd: report.periodEnd,
    callCount: report.callCount,
    lastHash,
    policyVersion: report.policyVersion,
    engine: report.engine,
    signedBy: report.signedBy,
    signedAt: report.signedAt,
  });
}

export function buildReport({ campaign, calls, findings, policy, now = new Date() }: BuildReportInput): Report {
  const eligible = calls.filter(
    (call) => call.campaignId === campaign.id && call.status === "completed",
  );
  const chain = buildChain(eligible, findings);
  const callIds = new Set(eligible.map((call) => call.id));
  const scoped = findings.filter((finding) => callIds.has(finding.callId));

  const periodStart =
    eligible.length > 0
      ? eligible.reduce(
          (min, call) => (call.startedAt < min ? call.startedAt : min),
          eligible[0].startedAt,
        )
      : now.toISOString();
  const periodEnd =
    eligible.length > 0
      ? eligible.reduce(
          (max, call) => (call.startedAt > max ? call.startedAt : max),
          eligible[0].startedAt,
        )
      : now.toISOString();

  const base = {
    id: `rpt-${campaign.id}-${now.getTime()}`,
    campaignId: campaign.id,
    periodStart,
    periodEnd,
    generatedAt: now.toISOString(),
    callCount: eligible.length,
    findingCount: scoped.length,
    openCount: scoped.filter((finding) => finding.status === "open").length,
    criticalCount: scoped.filter((finding) => finding.severity === "critical").length,
    chain,
    signedBy: null,
    signedAt: null,
    engine: engineFor(eligible),
    policyVersion: policy.version,
  };

  return { ...base, reportHash: digest(base) };
}

export function signReport(report: Report, signedBy: string, now: Date = new Date()): Report {
  const next: Report = {
    ...report,
    signedBy,
    signedAt: now.toISOString(),
  };
  return { ...next, reportHash: digest(next) };
}

export interface VerifyResult {
  ok: boolean;
  problems: string[];
  staleCount: number;
}

export function verifyReport(
  report: Report,
  calls: CallRecord[],
  findings: Finding[],
): VerifyResult {
  const problems: string[] = [];
  const eligible = calls.filter(
    (call) => call.campaignId === report.campaignId && call.status === "completed",
  );
  const chain = buildChain(eligible, findings);

  // A report is a point-in-time artifact. New calls appended after it was
  // generated sort to the end (ordered by startedAt), so the stored chain stays
  // a valid prefix. Extra calls are staleness, not tampering; fewer is a red flag.
  let staleCount = 0;
  if (chain.length > report.chain.length) {
    staleCount = chain.length - report.chain.length;
  } else if (chain.length < report.chain.length) {
    problems.push(
      `Stored chain has ${report.chain.length} calls but only ${chain.length} exist now — a call may have been removed.`,
    );
  }

  const length = Math.min(chain.length, report.chain.length);
  for (let i = 0; i < length; i += 1) {
    const expected = chain[i];
    const actual = report.chain[i];
    if (
      expected.callId !== actual.callId ||
      expected.transcriptHash !== actual.transcriptHash ||
      expected.findingsHash !== actual.findingsHash ||
      expected.prevHash !== actual.prevHash ||
      expected.hash !== actual.hash
    ) {
      problems.push(`Chain entry ${i} (${actual.callId}) does not recompute.`);
      break;
    }
  }

  const recomputed = digest(report);
  if (recomputed !== report.reportHash) {
    problems.push("Report hash does not match the stored report.");
  }

  return { ok: problems.length === 0, problems, staleCount };
}
