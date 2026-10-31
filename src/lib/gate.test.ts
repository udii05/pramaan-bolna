import { describe, expect, it } from "vitest";
import { evaluateGate } from "./gate";
import { DEFAULT_RULES } from "./policy";
import type { Campaign, Contact } from "./types";
import { sha256 } from "./hash";

const NOW = new Date("2026-10-25T05:30:00.000Z"); // 11:00 IST

function contact(overrides: Partial<Contact> = {}): Contact {
  return {
    id: "c-test",
    name: "Test Contact",
    phoneMasked: "+91 98•••••000",
    phoneHash: sha256("+919800000000"),
    timeZone: "Asia/Kolkata",
    consentStatus: "granted",
    consentCapturedAt: "2026-09-01T00:00:00.000Z",
    dndStatus: "clean",
    attempts: [],
    blocked: false,
    ...overrides,
  };
}

function campaign(overrides: Partial<Campaign> = {}): Campaign {
  return {
    id: "camp-test",
    name: "Test campaign",
    client: "Northstar Finance",
    agentName: "Aarav",
    status: "active",
    script: "Namaste, main ek AI assistant hoon.",
    policyId: "policy-collections-in",
    contactIds: ["c-test"],
    createdAt: "2026-10-01T00:00:00.000Z",
    ...overrides,
  };
}

function evaluate(contactOverrides: Partial<Contact> = {}, campaignOverrides: Partial<Campaign> = {}) {
  return evaluateGate({
    contact: contact(contactOverrides),
    campaign: campaign(campaignOverrides),
    rules: DEFAULT_RULES,
    now: NOW,
  });
}

describe("pre-call gate", () => {
  it("allows an eligible contact inside the window", () => {
    const result = evaluate();
    expect(result.decision).toBe("allow");
    expect(result.nextWindow).toBeNull();
  });

  it("denies a DND-listed number", () => {
    const result = evaluate({ dndStatus: "listed" });
    expect(result.decision).toBe("deny");
    expect(result.checks.some((check) => check.code === "DND_LISTED")).toBe(true);
  });

  it("denies an unknown DND status", () => {
    const result = evaluate({ dndStatus: "unknown" });
    expect(result.decision).toBe("deny");
    expect(result.checks.some((check) => check.code === "DND_UNKNOWN")).toBe(true);
  });

  it("denies missing consent", () => {
    const result = evaluate({ consentStatus: "missing", consentCapturedAt: null });
    expect(result.decision).toBe("deny");
    expect(result.checks.some((check) => check.code === "CONSENT_INVALID")).toBe(true);
  });

  it("denies stale consent", () => {
    const result = evaluate({ consentCapturedAt: "2025-01-01T00:00:00.000Z" });
    expect(result.decision).toBe("deny");
  });

  it("denies when the attempt cap is reached", () => {
    const result = evaluate({
      attempts: [
        "2026-10-25T04:30:00.000Z",
        "2026-10-25T03:30:00.000Z",
        "2026-10-25T02:30:00.000Z",
      ],
    });
    expect(result.decision).toBe("deny");
    expect(result.checks.some((check) => check.code === "ATTEMPT_CAP")).toBe(true);
  });

  it("denies a script without an AI disclosure", () => {
    const result = evaluate({}, { script: "Namaste, main Meera hoon." });
    expect(result.decision).toBe("deny");
    expect(result.checks.some((check) => check.code === "SCRIPT_MISSING_DISCLOSURE")).toBe(true);
  });

  it("reschedules outside the recipient's local window", () => {
    const result = evaluate({ timeZone: "America/Los_Angeles" });
    expect(result.decision).toBe("reschedule");
    expect(result.nextWindow).not.toBeNull();
    expect(result.checks.some((check) => check.code === "WINDOW_CLOSED")).toBe(true);
  });

  it("denies when the campaign is paused by the breaker", () => {
    const result = evaluate({}, { status: "paused", pauseReason: "Critical finding." });
    expect(result.decision).toBe("deny");
    expect(result.checks.some((check) => check.code === "CAMPAIGN_PAUSED")).toBe(true);
  });

  it("denies a blocked contact", () => {
    const result = evaluate({ blocked: true, blockReason: "Threat on prior call." });
    expect(result.decision).toBe("deny");
    expect(result.checks.some((check) => check.code === "CONTACT_BLOCKED")).toBe(true);
  });
});
