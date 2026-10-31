import type { PolicyRule, RawFinding, Turn } from "../types";
import { RULE_CODES } from "../policy";

function disclosurePatterns(rule: PolicyRule | undefined): RegExp[] {
  const raw = (rule?.config.requiredAny as string[] | undefined) ?? [];
  return raw.map((pattern) => new RegExp(pattern, "i"));
}

function firstAgentTurns(turns: Turn[], count: number): Turn[] {
  return turns.filter((turn) => turn.role === "agent").slice(0, count);
}

/**
 * Word-boundary matching. A plain substring search makes "fir" match "confirm"
 * and "emi" match "premium", which turns a compliant call into a finding.
 */
function termRegex(term: string): RegExp {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, "iu");
}

function termIndex(text: string, term: string): number {
  const match = termRegex(term).exec(text);
  return match ? match.index : -1;
}

function hasAny(text: string, terms: string[]): string | null {
  for (const term of terms) {
    if (termRegex(term).test(text)) return term;
  }
  return null;
}

function hasAnyRegex(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

function escapeLiteral(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * A negation may sit up to two words either side of the term, so "hum police ko
 * nahi bhejte" reads as compliant while "police ke paas jao, nahi to" (the neg
 * three words out) stays a threat.
 */
function isNegated(text: string, term: string, negationTerms: string[]): boolean {
  const lower = text.toLowerCase();
  const at = termIndex(lower, term);
  if (at < 0) return false;
  const window = lower.slice(Math.max(0, at - 32), Math.min(lower.length, at + term.length + 32));
  const t = escapeLiteral(term.toLowerCase());
  for (const neg of negationTerms) {
    const n = escapeLiteral(neg.toLowerCase().trim());
    if (!n) continue;
    const pattern = new RegExp(
      `(?:\\b${n}\\b(?:\\s+\\w+){0,2}\\s+\\b${t}\\b)|(?:\\b${t}\\b(?:\\s+\\w+){0,2}\\s+\\b${n}\\b)`,
      "u",
    );
    if (pattern.test(window)) return true;
  }
  return false;
}

interface TermHit {
  term: string;
  index: number;
  label: string;
}

function allHits(text: string, groups: { terms: string[]; label: string }[]): TermHit[] {
  const hits: TermHit[] = [];
  for (const group of groups) {
    for (const term of group.terms) {
      const index = termIndex(text, term);
      if (index >= 0) hits.push({ term, index, label: group.label });
    }
  }
  return hits.sort((a, b) => a.index - b.index);
}

/**
 * Words that are pure acknowledgement or copula. "Haan" or "theek hai" is not
 * proof of identity; a reply that contains only these does not verify anyone.
 */
const ACKNOWLEDGEMENTS = new Set([
  "haan", "ha", "ji", "jee", "yes", "yeah", "yep", "ok", "okay", "sure",
  "theek", "thik", "bilkul", "sahi", "hai", "hain", "hoon", "hu", "ho",
  "sir", "maam", "madam", "right", "correct",
]);

function isPositiveVerification(answer: string): boolean {
  const trimmed = answer.trim();
  if (/\d{2,4}/.test(trimmed)) return true;
  if (/\?|^(kaun|kya|kyun|who|what|why)\b/i.test(trimmed)) return false;
  const tokens = trimmed.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean);
  const content = tokens.filter((token) => !ACKNOWLEDGEMENTS.has(token));
  return tokens.length >= 2 && content.length >= 1;
}

function scanDisclosureSpoken(turns: Turn[], rule: PolicyRule | undefined): RawFinding[] {
  const limit = (rule?.config.withinAgentTurns as number | undefined) ?? 2;
  const patterns = disclosurePatterns(rule);
  const inspected = firstAgentTurns(turns, limit);
  if (inspected.length === 0) return [];
  if (inspected.some((turn) => hasAnyRegex(turn.text, patterns))) return [];
  const first = inspected[0];
  return [
    {
      ruleCode: RULE_CODES.AI_DISCLOSURE_SPOKEN,
      severity: "medium",
      quote: first.text,
      turnIndex: first.index,
      confidence: 0.98,
      rationale: `The opening script was configured, but no AI disclosure appears in the first ${limit} agent turns.`,
    },
  ];
}

function scanThirdParty(turns: Turn[], rule: PolicyRule | undefined): RawFinding[] {
  const config = (rule?.config ?? {}) as {
    verificationTerms?: string[];
    sensitiveTerms?: string[];
    amountPattern?: string;
    thirdPartyTerms?: string[];
  };
  const verificationTerms = config.verificationTerms ?? [];
  const sensitiveTerms = config.sensitiveTerms ?? [];
  const amountPattern = config.amountPattern ? new RegExp(config.amountPattern, "i") : null;
  const thirdPartyTerms = config.thirdPartyTerms ?? [];

  const findings: RawFinding[] = [];
  let verified = false;
  let verificationPending = false;
  let thirdPartyFlag = false;

  for (const turn of turns) {
    if (turn.role === "user") {
      const thirdParty = hasAny(turn.text, thirdPartyTerms);
      if (thirdParty) {
        thirdPartyFlag = true;
        verified = false;
        verificationPending = false;
      } else if (verificationPending) {
        if (isPositiveVerification(turn.text)) verified = true;
        verificationPending = false;
      }
      continue;
    }
    if (turn.role !== "agent") continue;

    if (hasAny(turn.text, verificationTerms)) verificationPending = true;

    const sensitiveTerm = hasAny(turn.text, sensitiveTerms);
    const amount = amountPattern ? amountPattern.test(turn.text) : false;
    if (!sensitiveTerm && !amount) continue;

    if (!verified) {
      const why = thirdPartyFlag
        ? "a third party had identified themselves"
        : "identity had not been verified";
      findings.push({
        ruleCode: RULE_CODES.NO_THIRD_PARTY_DISCLOSURE,
        severity: "high",
        quote: turn.text,
        turnIndex: turn.index,
        confidence: thirdPartyFlag ? 0.93 : 0.9,
        rationale: `The agent mentioned ${sensitiveTerm ? `"${sensitiveTerm}"` : "an amount"} while ${why}.`,
      });
    }
  }
  return findings;
}

function scanConduct(turns: Turn[], rule: PolicyRule | undefined): RawFinding[] {
  const config = (rule?.config ?? {}) as {
    threatTerms?: string[];
    falseLegalTerms?: string[];
    abuseTerms?: string[];
    optOutTerms?: string[];
    pressureTerms?: string[];
    negationTerms?: string[];
  };
  const negation = config.negationTerms ?? [];
  const groups = [
    { terms: config.falseLegalTerms ?? [], label: "a false legal claim" },
    { terms: config.threatTerms ?? [], label: "a threat" },
    { terms: config.abuseTerms ?? [], label: "abusive language" },
  ];

  const findings: RawFinding[] = [];
  const flaggedTurns = new Set<number>();

  for (const turn of turns) {
    if (turn.role !== "agent") continue;
    const hit = allHits(turn.text, groups).find(
      (candidate) => !isNegated(turn.text, candidate.term, negation),
    );
    if (hit) {
      flaggedTurns.add(turn.index);
      findings.push({
        ruleCode: RULE_CODES.NO_PROHIBITED_CONDUCT,
        severity: "critical",
        quote: turn.text,
        turnIndex: turn.index,
        confidence: 0.88,
        rationale: `Detected ${hit.label} ("${hit.term}").`,
      });
    }
  }

  const optOutAt = turns.findIndex(
    (turn) => turn.role === "user" && hasAny(turn.text, config.optOutTerms ?? []) !== null,
  );
  if (optOutAt >= 0) {
    for (let i = optOutAt + 1; i < turns.length; i += 1) {
      const turn = turns[i];
      if (turn.role !== "agent" || flaggedTurns.has(turn.index)) continue;
      const pressure = hasAny(turn.text, config.pressureTerms ?? []);
      if (pressure) {
        flaggedTurns.add(turn.index);
        findings.push({
          ruleCode: RULE_CODES.NO_PROHIBITED_CONDUCT,
          severity: "critical",
          quote: turn.text,
          turnIndex: turn.index,
          confidence: 0.82,
          rationale: `The person asked not to be called, and the agent continued with pressure ("${pressure}").`,
        });
      }
    }
  }

  return findings;
}

/**
 * Deterministic scanners for the three post-call rules. These always run, even
 * when the LLM judge is enabled. They are the floor, not the ceiling. Each
 * offending turn is reported, so a call with two threats yields two findings.
 */
export function scanPostCall(turns: Turn[], rules: PolicyRule[]): RawFinding[] {
  const byCode = new Map(rules.map((rule) => [rule.code, rule]));
  const findings: RawFinding[] = [];

  findings.push(...scanDisclosureSpoken(turns, byCode.get(RULE_CODES.AI_DISCLOSURE_SPOKEN)));
  findings.push(...scanThirdParty(turns, byCode.get(RULE_CODES.NO_THIRD_PARTY_DISCLOSURE)));
  findings.push(...scanConduct(turns, byCode.get(RULE_CODES.NO_PROHIBITED_CONDUCT)));

  return findings;
}
