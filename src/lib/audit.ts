import type { CallRecord, Engine, Finding, PolicyRule, RawFinding } from "./types";
import { groundQuote, hashJson, normalizeForMatch } from "./hash";
import { resolveJudgeMode, judgeWithLlm } from "./judge";
import { scanPostCall } from "./rules/postcall";

export interface AuditResult {
  findings: Finding[];
  engine: Engine;
  degraded: boolean;
  droppedUngrounded: number;
}

function findingId(callId: string, ruleCode: string, turnIndex: number, quote: string): string {
  return `fnd-${hashJson({ callId, ruleCode, turnIndex, quote }).slice(0, 16)}`;
}

/**
 * Audit one call. Deterministic scanners always run. The LLM judge is additive
 * and optional; if it fails the audit still completes and is marked degraded.
 */
export async function auditCall(
  call: CallRecord,
  rules: PolicyRule[],
  now: Date = new Date(),
  mode?: Engine,
): Promise<AuditResult> {
  const deterministic = scanPostCall(call.turns, rules);
  const llm = await judgeWithLlm(call, rules, mode);
  const degraded = resolveJudgeMode(mode) === "llm" && llm === null;

  const candidates: { raw: RawFinding; engine: Engine }[] = [
    ...deterministic.map((raw) => ({ raw, engine: "heuristic" as Engine })),
    ...((llm?.findings ?? []).map((raw) => ({ raw, engine: "llm" as Engine }))),
  ];

  let droppedUngrounded = 0;
  const byOccurrence = new Map<string, Finding>();

  for (const candidate of candidates) {
    const grounded = groundQuote(candidate.raw.quote, call.turns);
    if (!grounded.ok) {
      droppedUngrounded += 1;
      continue;
    }
    const rule = rules.find((entry) => entry.code === candidate.raw.ruleCode);
    if (!rule) continue;

    const finding: Finding = {
      id: findingId(call.id, rule.code, grounded.turnIndex, candidate.raw.quote),
      callId: call.id,
      ruleId: rule.id,
      ruleCode: rule.code,
      severity: rule.severity,
      quote: candidate.raw.quote,
      turnIndex: grounded.turnIndex,
      startMs: grounded.startMs,
      confidence: Math.max(0, Math.min(1, candidate.raw.confidence)),
      status: "open",
      engine: candidate.engine,
      rationale: candidate.raw.rationale,
      createdAt: now.toISOString(),
    };

    // One finding per rule *per turn*, so a call with two threats reports both.
    // Only exact repeats (same rule + same turn) collapse, keeping the higher
    // confidence — that is where a heuristic hit and an LLM hit describe one line.
    const key = `${rule.code}#${grounded.turnIndex}`;
    const existing = byOccurrence.get(key);
    if (!existing || finding.confidence > existing.confidence) {
      byOccurrence.set(key, finding);
    }
  }

  const findings = Array.from(byOccurrence.values()).sort(
    (a, b) => a.startMs - b.startMs || a.ruleCode.localeCompare(b.ruleCode),
  );

  return {
    findings,
    engine: llm ? "llm" : "heuristic",
    degraded,
    droppedUngrounded,
  };
}

export function isCritical(findings: Finding[]): boolean {
  return findings.some((finding) => finding.severity === "critical" && finding.status !== "dismissed");
}

export function dedupeKey(ruleCode: string, quote: string): string {
  return `${ruleCode}:${normalizeForMatch(quote).slice(0, 120)}`;
}
