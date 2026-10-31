import type {
  CalibrationLabel,
  CalibrationResult,
  Campaign,
  Contact,
  Finding,
  GateLabel,
  PolicyRule,
  RuleScore,
} from "./types";
import { evaluateGate } from "./gate";
import { RULE_CODES } from "./policy";

export function rate(numerator: number, denominator: number): number | null {
  if (denominator === 0) return null;
  return Math.round((numerator / denominator) * 1000) / 1000;
}

export interface CalibrationInput {
  labels: CalibrationLabel[];
  gateLabels: GateLabel[];
  findings: Finding[];
  contacts: Contact[];
  campaigns: Campaign[];
  rules: PolicyRule[];
  now: Date;
}

const SCORED_RULES = [
  RULE_CODES.AI_DISCLOSURE_SPOKEN,
  RULE_CODES.NO_THIRD_PARTY_DISCLOSURE,
  RULE_CODES.NO_PROHIBITED_CONDUCT,
];

export function evaluateCalibration(input: CalibrationInput): CalibrationResult {
  const perRule = new Map<string, RuleScore>();
  for (const code of SCORED_RULES) {
    const rule = input.rules.find((entry) => entry.code === code);
    perRule.set(code, {
      code,
      title: rule?.title ?? code,
      truePositives: 0,
      falsePositives: 0,
      falseNegatives: 0,
      expected: 0,
      precision: null,
      recall: null,
    });
  }

  for (const label of input.labels) {
    const predicted = new Set(
      input.findings.filter((finding) => finding.callId === label.callId).map((f) => f.ruleCode),
    );
    const expected = new Set(label.expected);
    for (const code of SCORED_RULES) {
      const score = perRule.get(code)!;
      if (expected.has(code)) score.expected += 1;
      if (predicted.has(code) && expected.has(code)) score.truePositives += 1;
      if (predicted.has(code) && !expected.has(code)) score.falsePositives += 1;
      if (!predicted.has(code) && expected.has(code)) score.falseNegatives += 1;
    }
  }

  let tp = 0;
  let fp = 0;
  let fn = 0;
  const scores = Array.from(perRule.values()).map((score) => {
    tp += score.truePositives;
    fp += score.falsePositives;
    fn += score.falseNegatives;
    return {
      ...score,
      precision: rate(score.truePositives, score.truePositives + score.falsePositives),
      recall: rate(score.truePositives, score.truePositives + score.falseNegatives),
    };
  });

  let gateCorrect = 0;
  for (const label of input.gateLabels) {
    const contact = input.contacts.find((entry) => entry.id === label.contactId);
    const campaign = input.campaigns.find((entry) => entry.id === label.campaignId);
    if (!contact || !campaign) continue;
    const result = evaluateGate({
      contact,
      campaign,
      rules: input.rules,
      now: input.now,
    });
    if (result.decision === label.expected) gateCorrect += 1;
  }

  return {
    perRule: scores,
    overall: {
      precision: rate(tp, tp + fp),
      recall: rate(tp, tp + fn),
      truePositives: tp,
      falsePositives: fp,
      falseNegatives: fn,
    },
    gate: {
      correct: gateCorrect,
      total: input.gateLabels.length,
      accuracy: rate(gateCorrect, input.gateLabels.length) ?? 0,
    },
  };
}
