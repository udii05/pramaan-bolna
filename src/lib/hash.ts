import { createHash } from "node:crypto";
import type { Finding, Turn } from "./types";

/**
 * Deterministic JSON serialisation. Key order is sorted at every depth so the
 * hash of the same logical object is stable across runs and machines.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) out[key] = sortValue(obj[key]);
    return out;
  }
  return value;
}

export function sha256(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

export function hashJson(value: unknown): string {
  return sha256(canonicalJson(value));
}

export function hashTranscript(turns: Turn[]): string {
  return hashJson(
    turns.map((turn) => ({
      index: turn.index,
      role: turn.role,
      text: turn.text,
      startMs: turn.startMs,
    })),
  );
}

export function hashFindings(findings: Finding[]): string {
  const stable = findings
    .map((finding) => ({
      ruleCode: finding.ruleCode,
      quote: finding.quote,
      turnIndex: finding.turnIndex,
      startMs: finding.startMs,
      severity: finding.severity,
    }))
    .sort((a, b) =>
      `${a.ruleCode}:${a.turnIndex}:${a.quote}`.localeCompare(
        `${b.ruleCode}:${b.turnIndex}:${b.quote}`,
      ),
    );
  return hashJson(stable);
}

/**
 * Normalisation used for quote grounding. Aggressive on purpose: a finding is
 * only accepted when its quote survives this and is still a substring of a turn.
 */
export function normalizeForMatch(input: string): string {
  return input
    .toLowerCase()
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[“”‘’"'`.,!?;:()[\]{}<>|/\\]/g, " ")
    .replace(/[–—]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export interface GroundingResult {
  ok: boolean;
  turnIndex: number;
  startMs: number;
  reason?: string;
}

/**
 * A quote is only evidence if it exists verbatim in a single turn. No fuzzy
 * matching, no cross-turn stitching. If the model paraphrased, the finding dies.
 */
export function groundQuote(quote: string, turns: Turn[]): GroundingResult {
  const needle = normalizeForMatch(quote);
  if (needle.length < 8) {
    return { ok: false, turnIndex: -1, startMs: 0, reason: "quote too short" };
  }
  for (const turn of turns) {
    if (turn.role !== "agent") continue;
    if (normalizeForMatch(turn.text).includes(needle)) {
      return { ok: true, turnIndex: turn.index, startMs: turn.startMs };
    }
  }
  return { ok: false, turnIndex: -1, startMs: 0, reason: "quote not found in agent turns" };
}
