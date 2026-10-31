import { describe, expect, it } from "vitest";
import { buildSeedDb, CALIBRATION_LABELS, CALIBRATION_NOW, GATE_LABELS } from "./seed-data";
import { evaluateCalibration } from "./metrics";

describe("calibration", () => {
  it("computes honest per-rule scores from the seeded corpus", async () => {
    const db = await buildSeedDb();
    const result = evaluateCalibration({
      labels: CALIBRATION_LABELS,
      gateLabels: GATE_LABELS,
      findings: db.findings,
      contacts: db.contacts,
      campaigns: db.campaigns,
      rules: db.rules,
      now: new Date(CALIBRATION_NOW),
    });

    expect(result.gate.accuracy).toBe(1);
    expect(result.overall.precision).toBe(1);
    expect(result.overall.recall).toBeLessThan(1);

    const conduct = result.perRule.find((rule) => rule.code === "NO_PROHIBITED_CONDUCT");
    expect(conduct?.falseNegatives).toBeGreaterThanOrEqual(1);
    expect(conduct?.recall).toBeLessThan(1);
    expect(conduct?.recall).toBeGreaterThan(0.5);

    for (const score of result.perRule) {
      expect(score.precision).not.toBeNull();
    }
  });
});
