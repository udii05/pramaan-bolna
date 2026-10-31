import { z } from "zod";
import type { CallRecord, Engine, PolicyRule, RawFinding, Severity } from "./types";
import { RULE_CODES } from "./policy";

const responseSchema = z.object({
  findings: z
    .array(
      z.object({
        ruleCode: z.string(),
        quote: z.string(),
        confidence: z.number().min(0).max(1),
        rationale: z.string(),
      }),
    )
    .default([]),
});

const ALLOWED = new Set<string>([
  RULE_CODES.NO_THIRD_PARTY_DISCLOSURE,
  RULE_CODES.NO_PROHIBITED_CONDUCT,
]);

const SYSTEM_PROMPT = `You are a compliance auditor for collections phone calls in India.

You are given a policy and a transcript. Report only violations you can support with a quote
copied verbatim from a single agent turn. Never paraphrase a quote. If you cannot copy an exact
quote, do not report the finding.

Rules:
1. NO_THIRD_PARTY_DISCLOSURE — the agent must not mention a loan, EMI, amount, due date or debt
   before the borrower's identity is verified. If a third party identifies themselves, any debt
   disclosure is a violation.
2. NO_PROHIBITED_CONDUCT — no threats of police, arrest, home visits, seizure or legal action; no
   false legal claims; no abuse; no pressure after the person asks not to be called.
   A statement that explicitly says these things will NOT happen is not a violation.

Return JSON only, in this shape:
{"findings":[{"ruleCode":"...","quote":"...","confidence":0.0,"rationale":"..."}]}
If there is no violation, return {"findings":[]}.`;

interface JudgeOutcome {
  findings: RawFinding[];
}

export function resolveJudgeMode(mode?: Engine): Engine {
  if (mode === "llm" || mode === "heuristic") return mode;
  return process.env.PRAMAAN_JUDGE === "llm" ? "llm" : "heuristic";
}

export function hasApiKey(): boolean {
  return Boolean(process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY);
}

export function judgeProvider(): "gemini" | "openai" {
  return process.env.GEMINI_API_KEY ? "gemini" : "openai";
}

export function judgeEnabled(mode?: Engine): boolean {
  return resolveJudgeMode(mode) === "llm" && hasApiKey();
}

function severityFor(ruleCode: string, rules: PolicyRule[]): Severity {
  return rules.find((rule) => rule.code === ruleCode)?.severity ?? "high";
}

function transcriptForPrompt(call: CallRecord): string {
  return call.turns
    .map(
      (turn) =>
        `[turn ${turn.index} | ${turn.role} | ${Math.round(turn.startMs / 1000)}s] ${turn.text}`,
    )
    .join("\n");
}

/**
 * Optional semantic judge. Any failure returns null and the caller degrades to
 * the deterministic scanners, which always run regardless.
 */
export async function judgeWithLlm(
  call: CallRecord,
  rules: PolicyRule[],
  mode?: Engine,
): Promise<JudgeOutcome | null> {
  if (!judgeEnabled(mode)) return null;

  const gemini = judgeProvider() === "gemini";
  const apiKey = gemini ? process.env.GEMINI_API_KEY : process.env.OPENAI_API_KEY;
  const base = (
    gemini
      ? (process.env.GEMINI_BASE_URL ?? "https://generativelanguage.googleapis.com/v1beta/openai")
      : (process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1")
  ).replace(/\/$/, "");
  const model = gemini
    ? (process.env.GEMINI_MODEL ?? "gemini-3.5-flash-lite")
    : (process.env.OPENAI_MODEL ?? "gpt-4.1-mini");
  const policy = rules
    .filter((rule) => ALLOWED.has(rule.code))
    .map((rule) => `- ${rule.code} (${rule.severity}): ${rule.description}`)
    .join("\n");

  try {
    const response = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(20_000),
      body: JSON.stringify({
        model,
        temperature: 0,
        // Gemini's OpenAI-compatible endpoint accepts JSON mode; OpenAI does too.
        ...(gemini ? {} : { response_format: { type: "json_object" } }),
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: `Policy:\n${policy}\n\nTranscript:\n${transcriptForPrompt(call)}`,
          },
        ],
      }),
    });

    if (!response.ok) return null;
    const body = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = body.choices?.[0]?.message?.content;
    if (!content) return null;

    const parsed = responseSchema.safeParse(parseJsonLoose(content));
    if (!parsed.success) return null;

    const findings: RawFinding[] = parsed.data.findings
      .filter((finding) => ALLOWED.has(finding.ruleCode))
      .map((finding) => ({
        ruleCode: finding.ruleCode,
        severity: severityFor(finding.ruleCode, rules),
        quote: finding.quote,
        turnIndex: -1,
        confidence: finding.confidence,
        rationale: finding.rationale,
      }));

    return { findings };
  } catch {
    return null;
  }
}

function stripFences(input: string): string {
  const trimmed = input.trim();
  if (!trimmed.startsWith("```")) return trimmed;
  return trimmed.replace(/^```(?:json)?\s*/i, "").replace(/```$/i, "").trim();
}

/** Models sometimes wrap JSON in prose. Take the outermost object. */
function parseJsonLoose(input: string): unknown {
  const cleaned = stripFences(input);
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start === -1 || end <= start) throw new Error("no JSON object");
    return JSON.parse(cleaned.slice(start, end + 1));
  }
}
