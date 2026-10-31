import { describe, expect, it } from "vitest";
import { DEFAULT_RULES } from "../policy";
import { scanPostCall } from "./postcall";
import type { Turn, TurnRole } from "../types";

function build(specs: [TurnRole, string][]): Turn[] {
  let cursor = 0;
  return specs.map(([role, text], index) => {
    const startMs = cursor;
    const endMs = cursor + Math.max(1500, text.length * 60);
    cursor = endMs;
    return { index, role, text, startMs, endMs };
  });
}

const codes = (turns: Turn[]) => scanPostCall(turns, DEFAULT_RULES).map((f) => f.ruleCode);

describe("AI_DISCLOSURE_SPOKEN", () => {
  it("fires when the first agent turns do not disclose the AI", () => {
    const turns = build([
      ["agent", "Namaste, main Meera hoon, Northstar Finance se."],
      ["user", "Haan boliye."],
      ["agent", "Aap top-up offer ke liye eligible hain."],
    ]);
    expect(codes(turns)).toContain("AI_DISCLOSURE_SPOKEN");
  });

  it("does not fire when the first agent turn discloses the AI", () => {
    const turns = build([
      ["agent", "Namaste, main ek AI assistant hoon."],
      ["user", "Haan."],
      ["agent", "Aap top-up offer ke liye eligible hain."],
    ]);
    expect(codes(turns)).not.toContain("AI_DISCLOSURE_SPOKEN");
  });

  it("fires when the disclosure arrives in the third agent turn", () => {
    const turns = build([
      ["agent", "Namaste, main Aarav hoon."],
      ["user", "Haan."],
      ["agent", "Identity verify karne ke liye date of birth bataiye."],
      ["user", "15 January 1990."],
      ["agent", "Main ek AI assistant hoon. Aapka payment due hai."],
    ]);
    expect(codes(turns)).toContain("AI_DISCLOSURE_SPOKEN");
  });
});

describe("NO_THIRD_PARTY_DISCLOSURE", () => {
  it("fires when an amount is mentioned before verification", () => {
    const turns = build([
      ["agent", "Namaste, main ek AI assistant hoon. Kya main Arjun ji se baat kar raha hoon?"],
      ["user", "Haan boliye."],
      ["agent", "Aapke personal loan ka 48,000 rupaye outstanding hai."],
    ]);
    const findings = scanPostCall(turns, DEFAULT_RULES);
    const finding = findings.find((f) => f.ruleCode === "NO_THIRD_PARTY_DISCLOSURE");
    expect(finding).toBeTruthy();
    expect(finding?.quote).toContain("48,000");
  });

  it("does not fire after a date-of-birth verification", () => {
    const turns = build([
      ["agent", "Namaste, main ek AI assistant hoon. Verification ke liye date of birth bata dijiye."],
      ["user", "12 August 1991."],
      ["agent", "Aapka 48,000 rupaye ka loan due hai."],
    ]);
    expect(codes(turns)).not.toContain("NO_THIRD_PARTY_DISCLOSURE");
  });

  it("fires when a third party takes over after verification", () => {
    const turns = build([
      ["agent", "Namaste, main ek AI assistant hoon. Verification ke liye date of birth bata dijiye."],
      ["user", "12 August 1991."],
      ["agent", "Aapka 9,800 rupaye ka EMI due hai."],
      ["user", "Main unka bhai hoon, unse baat karwa deta hoon."],
      ["agent", "Unka 9,800 rupaye overdue hai, unse keh dijiye."],
    ]);
    expect(codes(turns)).toContain("NO_THIRD_PARTY_DISCLOSURE");
  });

  it("does not fire when a wrong number is disclosed with no debt mention", () => {
    const turns = build([
      ["agent", "Namaste, main ek AI assistant hoon. Kya main Neha ji se baat kar raha hoon?"],
      ["user", "Nahi, galat number hai."],
      ["agent", "Maaf kijiye, main call end kar raha hoon."],
    ]);
    expect(codes(turns)).not.toContain("NO_THIRD_PARTY_DISCLOSURE");
  });
});

describe("NO_PROHIBITED_CONDUCT", () => {
  it("fires on a police threat", () => {
    const turns = build([
      ["agent", "Agar payment nahi hua to hum police bhej denge."],
    ]);
    expect(codes(turns)).toContain("NO_PROHIBITED_CONDUCT");
  });

  it("does not fire on a negated threat", () => {
    const turns = build([
      ["agent", "Hum police nahi bhejte aur koi legal action nahi lenge."],
    ]);
    expect(codes(turns)).not.toContain("NO_PROHIBITED_CONDUCT");
  });

  it("fires on pressure after an opt-out", () => {
    const turns = build([
      ["user", "Please mujhe dobara call mat karo."],
      ["agent", "Aapko karna padega, warna late fee lag jayegi."],
    ]);
    expect(codes(turns)).toContain("NO_PROHIBITED_CONDUCT");
  });

  it("fires on abuse", () => {
    const turns = build([["agent", "Aap bewakoof hain, itni si baat nahi samajhte."]]);
    expect(codes(turns)).toContain("NO_PROHIBITED_CONDUCT");
  });

  it("does not fire on a negated insult", () => {
    const turns = build([["agent", "Aap bewakoof nahi hain, bas samajhne ki zaroorat hai."]]);
    expect(codes(turns)).not.toContain("NO_PROHIBITED_CONDUCT");
  });

  it("misses an implied threat the lexicon does not cover", () => {
    const turns = build([["agent", "Aapko pata chal jayega agar payment nahi kiya."]]);
    expect(codes(turns)).not.toContain("NO_PROHIBITED_CONDUCT");
  });

  it("reports every offending turn, not just the first", () => {
    const turns = build([
      ["agent", "Aapke paas police bhej denge."],
      ["user", "Please."],
      ["agent", "Aap bewakoof hain."],
    ]);
    const conduct = scanPostCall(turns, DEFAULT_RULES).filter(
      (f) => f.ruleCode === "NO_PROHIBITED_CONDUCT",
    );
    expect(conduct).toHaveLength(2);
  });
});

describe("negation with an intervening word", () => {
  it("does not fire on 'police ko nahi bhejte'", () => {
    const turns = build([["agent", "Hum police ko nahi bhejte."]]);
    expect(codes(turns)).not.toContain("NO_PROHIBITED_CONDUCT");
  });

  it("still fires when the negation is too far from the term", () => {
    const turns = build([["agent", "Police ke paas jaao, warna case hoga."]]);
    expect(codes(turns)).toContain("NO_PROHIBITED_CONDUCT");
  });
});

describe("verification must be a positive signal", () => {
  it("treats a bare 'haan' as unverified", () => {
    const turns = build([
      ["agent", "Main ek AI assistant hoon. Verification ke liye date of birth bata dijiye."],
      ["user", "Haan."],
      ["agent", "Aapka 48,000 rupaye ka loan due hai."],
    ]);
    expect(codes(turns)).toContain("NO_THIRD_PARTY_DISCLOSURE");
  });

  it("treats 'theek hai' as unverified", () => {
    const turns = build([
      ["agent", "Verification ke liye last four digits bataiye."],
      ["user", "Theek hai."],
      ["agent", "Aapke 12,000 rupaye ka loan due hai."],
    ]);
    expect(codes(turns)).toContain("NO_THIRD_PARTY_DISCLOSURE");
  });

  it("accepts a name confirmation as verified", () => {
    const turns = build([
      ["agent", "Verification ke liye date of birth bata dijiye."],
      ["user", "Haan, main Priya bol rahi hoon."],
      ["agent", "Aapka 48,000 rupaye ka loan due hai."],
    ]);
    expect(codes(turns)).not.toContain("NO_THIRD_PARTY_DISCLOSURE");
  });
});
