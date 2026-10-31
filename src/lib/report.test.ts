import { describe, expect, it } from "vitest";
import { buildReport, signReport, verifyReport } from "./report";
import { DEFAULT_POLICY } from "./policy";
import { hashTranscript } from "./hash";
import type { CallRecord, Campaign, Finding, Turn } from "./types";

const campaign: Campaign = {
  id: "camp-test",
  name: "Test",
  client: "Northstar Finance",
  agentName: "Aarav",
  status: "active",
  script: "Namaste, main ek AI assistant hoon.",
  policyId: DEFAULT_POLICY.id,
  contactIds: ["c-1", "c-2"],
  createdAt: "2026-10-01T00:00:00.000Z",
};

const turns: Turn[] = [
  { index: 0, role: "agent", text: "Namaste, main ek AI assistant hoon.", startMs: 0, endMs: 3000 },
  { index: 1, role: "user", text: "Haan.", startMs: 3000, endMs: 4000 },
];

function call(id: string, startedAt: string): CallRecord {
  return {
    id,
    bolnaExecutionId: null,
    campaignId: campaign.id,
    contactId: "c-1",
    agentId: null,
    startedAt,
    durationMs: 4000,
    status: "completed",
    turns,
    recordingUrl: null,
    transcriptHash: hashTranscript(turns),
    source: "seed",
    costInr: 3,
    auditedAt: "2026-10-25T05:30:00.000Z",
    engine: "heuristic",
    degraded: false,
  };
}

const calls = [call("call-a", "2026-10-23T10:00:00+05:30"), call("call-b", "2026-10-24T10:00:00+05:30")];

const findings: Finding[] = [
  {
    id: "fnd-1",
    callId: "call-a",
    ruleId: "rule-conduct",
    ruleCode: "NO_PROHIBITED_CONDUCT",
    severity: "critical",
    quote: "Namaste, main ek AI assistant hoon.",
    turnIndex: 0,
    startMs: 0,
    confidence: 0.9,
    status: "open",
    engine: "heuristic",
    rationale: "Test finding.",
    createdAt: "2026-10-25T05:30:00.000Z",
  },
];

describe("report chain", () => {
  it("builds a chain with one entry per call", () => {
    const report = buildReport({
      campaign,
      calls,
      findings,
      policy: DEFAULT_POLICY,
      now: new Date("2026-10-25T06:00:00.000Z"),
    });
    expect(report.callCount).toBe(2);
    expect(report.chain).toHaveLength(2);
    expect(report.chain[0].prevHash).toBe("GENESIS");
    expect(report.chain[1].prevHash).toBe(report.chain[0].hash);
    expect(report.findingCount).toBe(1);
    expect(report.criticalCount).toBe(1);
  });

  it("verifies an untouched report", () => {
    const report = buildReport({ campaign, calls, findings, policy: DEFAULT_POLICY });
    expect(verifyReport(report, calls, findings).ok).toBe(true);
  });

  it("stays valid when a reviewer changes a finding status", () => {
    const report = buildReport({ campaign, calls, findings, policy: DEFAULT_POLICY });
    const reviewed = findings.map((finding) => ({ ...finding, status: "dismissed" as const }));
    expect(verifyReport(report, calls, reviewed).ok).toBe(true);
  });

  it("detects a tampered transcript", () => {
    const report = buildReport({ campaign, calls, findings, policy: DEFAULT_POLICY });
    const tampered = calls.map((entry) =>
      entry.id === "call-a"
        ? {
            ...entry,
            turns: entry.turns.map((turn) =>
              turn.index === 0 ? { ...turn, text: "Namaste, main ek human hoon." } : turn,
            ),
          }
        : entry,
    );
    const result = verifyReport(report, tampered, findings);
    expect(result.ok).toBe(false);
    expect(result.problems.join(" ")).toMatch(/Chain entry/);
  });

  it("re-hashes on signature and still verifies", () => {
    const report = buildReport({ campaign, calls, findings, policy: DEFAULT_POLICY });
    const signed = signReport(report, "Compliance Officer", new Date("2026-10-25T07:00:00.000Z"));
    expect(signed.reportHash).not.toBe(report.reportHash);
    expect(verifyReport(signed, calls, findings).ok).toBe(true);
  });

  it("treats appended calls as staleness, not tampering", () => {
    const report = buildReport({ campaign, calls, findings, policy: DEFAULT_POLICY });
    const later = call("call-c", "2026-10-25T10:00:00+05:30");
    const result = verifyReport(report, [...calls, later], findings);
    expect(result.ok).toBe(true);
    expect(result.staleCount).toBe(1);
  });

  it("flags a removed call as a real problem", () => {
    const report = buildReport({ campaign, calls, findings, policy: DEFAULT_POLICY });
    const result = verifyReport(report, [calls[0]], findings);
    expect(result.ok).toBe(false);
    expect(result.problems.join(" ")).toMatch(/removed/);
  });
});
