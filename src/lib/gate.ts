import type { Campaign, Contact, GateCheck, GateResult, PolicyRule } from "./types";
import { RULE_CODES } from "./policy";

interface WindowConfig {
  startHour: number;
  endHour: number;
  allowedWeekdays: number[];
  fallbackTimeZone: string;
}

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

function localParts(date: Date, timeZone: string): { hour: number; weekday: number } {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  });
  const parts = formatter.formatToParts(date);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
  const weekdayShort = parts.find((part) => part.type === "weekday")?.value ?? "Sun";
  return { hour, weekday: WEEKDAY_INDEX[weekdayShort] ?? 0 };
}

function inWindow(date: Date, config: WindowConfig, timeZone: string): boolean {
  const { hour, weekday } = localParts(date, timeZone);
  return (
    config.allowedWeekdays.includes(weekday) &&
    hour >= config.startHour &&
    hour < config.endHour
  );
}

export function nextAllowedWindow(
  now: Date,
  config: WindowConfig,
  timeZone: string,
): Date | null {
  for (let offset = 1; offset <= 24 * 8; offset += 1) {
    const candidate = new Date(now.getTime() + offset * 60 * 60 * 1000);
    if (inWindow(candidate, config, timeZone)) return candidate;
  }
  return null;
}

function findRule(rules: PolicyRule[], code: string): PolicyRule | undefined {
  return rules.find((rule) => rule.code === code);
}

export interface GateInput {
  contact: Contact;
  campaign: Campaign;
  rules: PolicyRule[];
  now?: Date;
}

export function evaluateGate({ contact, campaign, rules, now = new Date() }: GateInput): GateResult {
  const checks: GateCheck[] = [];
  const windowRule = findRule(rules, RULE_CODES.CALL_WINDOW);
  const eligibilityRule = findRule(rules, RULE_CODES.CONTACT_ELIGIBILITY);
  const scriptRule = findRule(rules, RULE_CODES.AI_DISCLOSURE_IN_SCRIPT);

  const timeZone =
    contact.timeZone ||
    ((windowRule?.config.fallbackTimeZone as string | undefined) ?? "Asia/Kolkata");

  // --- Contact eligibility -------------------------------------------------
  const eligibilityId = eligibilityRule?.id ?? "rule-eligibility";
  if (campaign.status === "paused") {
    checks.push({
      ruleId: eligibilityId,
      code: "CAMPAIGN_PAUSED",
      ok: false,
      message: "Campaign is paused by the circuit breaker.",
      detail: campaign.pauseReason ?? "A critical violation paused this campaign.",
    });
  }
  if (contact.blocked) {
    checks.push({
      ruleId: eligibilityId,
      code: "CONTACT_BLOCKED",
      ok: false,
      message: "Contact is blocked.",
      detail: contact.blockReason ?? "Blocked after a critical finding.",
    });
  }

  const maxConsentAgeDays = Number(eligibilityRule?.config.maxConsentAgeDays ?? 180);
  const consentOk =
    contact.consentStatus === "granted" &&
    contact.consentCapturedAt !== null &&
    (now.getTime() - new Date(contact.consentCapturedAt).getTime()) / 86_400_000 <=
      maxConsentAgeDays;
  checks.push({
    ruleId: eligibilityId,
    code: consentOk ? "CONSENT_OK" : "CONSENT_INVALID",
    ok: consentOk,
    message: consentOk
      ? "Consent is on record and fresh."
      : "Consent is missing, revoked, or older than the policy allows.",
    detail: contact.consentCapturedAt
      ? `Captured ${contact.consentCapturedAt.slice(0, 10)}; status ${contact.consentStatus}.`
      : `Status ${contact.consentStatus}.`,
  });

  const dndOk = contact.dndStatus === "clean";
  checks.push({
    ruleId: eligibilityId,
    code: dndOk ? "DND_CLEAN" : contact.dndStatus === "listed" ? "DND_LISTED" : "DND_UNKNOWN",
    ok: dndOk,
    message: dndOk ? "Number is not on the DND list." : "Number is on DND or its status is unknown.",
    detail: `DND status: ${contact.dndStatus}.`,
  });

  const maxAttempts = Number(eligibilityRule?.config.maxAttemptsPer24h ?? 3);
  const since = now.getTime() - 24 * 60 * 60 * 1000;
  const attempts24h = contact.attempts.filter((at) => new Date(at).getTime() >= since).length;
  const attemptsOk = attempts24h < maxAttempts;
  checks.push({
    ruleId: eligibilityId,
    code: attemptsOk ? "ATTEMPTS_OK" : "ATTEMPT_CAP",
    ok: attemptsOk,
    message: attemptsOk
      ? `Attempts in the last 24h: ${attempts24h} of ${maxAttempts}.`
      : `Attempt cap reached: ${attempts24h} of ${maxAttempts} in 24h.`,
    detail: "Policy caps contact attempts per rolling 24 hours.",
  });

  // --- Script disclosure ---------------------------------------------------
  const scriptId = scriptRule?.id ?? "rule-script-disclosure";
  const patterns = ((scriptRule?.config.requiredAny as string[] | undefined) ?? []).map(
    (pattern) => new RegExp(pattern, "i"),
  );
  const scriptOk = patterns.length > 0 && patterns.some((pattern) => pattern.test(campaign.script));
  checks.push({
    ruleId: scriptId,
    code: scriptOk ? "SCRIPT_DISCLOSURE_OK" : "SCRIPT_MISSING_DISCLOSURE",
    ok: scriptOk,
    message: scriptOk
      ? "Opening script discloses that the caller is an AI."
      : "Opening script has no AI disclosure. This campaign cannot dial.",
    detail: campaign.script.slice(0, 140),
  });

  // --- Calling window ------------------------------------------------------
  const windowId = windowRule?.id ?? "rule-window";
  const windowConfig: WindowConfig = {
    startHour: Number(windowRule?.config.startHour ?? 8),
    endHour: Number(windowRule?.config.endHour ?? 19),
    allowedWeekdays: (windowRule?.config.allowedWeekdays as number[] | undefined) ?? [1, 2, 3, 4, 5, 6],
    fallbackTimeZone: timeZone,
  };
  const windowOk = inWindow(now, windowConfig, timeZone);
  checks.push({
    ruleId: windowId,
    code: windowOk ? "WINDOW_OK" : "WINDOW_CLOSED",
    ok: windowOk,
    message: windowOk
      ? `Inside the ${windowConfig.startHour}:00–${windowConfig.endHour}:00 window.`
      : `Outside the ${windowConfig.startHour}:00–${windowConfig.endHour}:00 window in ${timeZone}.`,
    detail: "Evaluated in the recipient's local time zone.",
  });

  const hardFailures = checks.filter(
    (check) =>
      !check.ok &&
      ["CAMPAIGN_PAUSED", "CONTACT_BLOCKED", "CONSENT_INVALID", "DND_LISTED", "DND_UNKNOWN", "ATTEMPT_CAP", "SCRIPT_MISSING_DISCLOSURE"].includes(
        check.code,
      ),
  );
  const windowFailure = !windowOk;

  let decision: GateResult["decision"] = "allow";
  let nextWindow: string | null = null;
  if (hardFailures.length > 0) {
    decision = "deny";
  } else if (windowFailure) {
    decision = "reschedule";
    const next = nextAllowedWindow(now, windowConfig, timeZone);
    nextWindow = next ? next.toISOString() : null;
  }

  return {
    decision,
    checks,
    evaluatedAt: now.toISOString(),
    nextWindow,
  };
}
