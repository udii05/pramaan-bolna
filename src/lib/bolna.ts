import type { Turn, TurnRole } from "./types";

export interface NormalizedExecution {
  executionId: string | null;
  agentId: string | null;
  status: "completed" | "no_answer" | "error";
  turns: Turn[];
  recordingUrl: string | null;
  startedAt: string;
  durationMs: number;
  contactPhone: string | null;
  campaignId: string | null;
  contactId: string | null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function num(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return null;
}

function roleOf(value: unknown): TurnRole {
  const role = String(value ?? "").toLowerCase();
  if (["assistant", "agent", "bot", "ai"].includes(role)) return "agent";
  if (["user", "customer", "human", "caller"].includes(role)) return "user";
  return "system";
}

function toMs(value: number | null): number | null {
  if (value === null) return null;
  return value > 1000 ? Math.round(value) : Math.round(value * 1000);
}

function approxDuration(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1200, Math.round((words / 2.5) * 1000));
}

function fromArray(items: unknown[]): Turn[] {
  const parsed = items
    .map((item) => {
      const record = asRecord(item);
      if (!record) return null;
      const text = str(record.content) ?? str(record.text) ?? str(record.message);
      if (!text) return null;
      return {
        role: roleOf(record.role ?? record.speaker),
        text,
        start: toMs(num(record.start_time ?? record.start ?? record.startMs ?? record.start_ms)),
        end: toMs(num(record.end_time ?? record.end ?? record.endMs ?? record.end_ms)),
      };
    })
    .filter(Boolean) as { role: TurnRole; text: string; start: number | null; end: number | null }[];

  let cursor = 0;
  return parsed.map((item, index) => {
    const start = item.start ?? cursor;
    const end = item.end ?? start + approxDuration(item.text);
    cursor = end;
    return { index, role: item.role, text: item.text, startMs: start, endMs: end };
  });
}

function fromString(input: string): Turn[] {
  const lines = input
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const parsed = lines.map((line) => {
    const match = line.match(/^(assistant|agent|bot|ai|user|customer|human)\s*:\s*(.+)$/i);
    if (match) return { role: roleOf(match[1]), text: match[2] };
    return { role: "agent" as TurnRole, text: line };
  });
  let cursor = 0;
  return parsed.map((item, index) => {
    const duration = approxDuration(item.text);
    const turn = {
      index,
      role: item.role,
      text: item.text,
      startMs: cursor,
      endMs: cursor + duration,
    };
    cursor += duration;
    return turn;
  });
}

/**
 * Tolerant normaliser. Bolna payloads vary by plan and endpoint, so this
 * accepts several shapes and never throws on a missing field.
 */
export function normalizeBolnaExecution(payload: unknown): NormalizedExecution {
  const root = asRecord(payload) ?? {};
  const data = asRecord(root.data) ?? root;
  const telephony = asRecord(data.telephony_data) ?? asRecord(root.telephony_data) ?? {};

  const transcript = data.transcript ?? root.transcript;
  let turns: Turn[] = [];
  if (Array.isArray(transcript)) turns = fromArray(transcript);
  else if (typeof transcript === "string") turns = fromString(transcript);

  const transcriptObject = data.transcript_object ?? root.transcript_object;
  if (turns.length === 0 && Array.isArray(transcriptObject)) turns = fromArray(transcriptObject);

  const durationSec = num(data.conversation_duration ?? data.duration ?? root.conversation_duration);
  const lastEnd = turns.length > 0 ? turns[turns.length - 1].endMs : 0;
  const durationMs = durationSec !== null ? Math.round(durationSec * 1000) : lastEnd;

  const rawUserData = data.user_data ?? root.user_data;
  const userData =
    typeof rawUserData === "string"
      ? (() => {
          try {
            return asRecord(JSON.parse(rawUserData));
          } catch {
            return null;
          }
        })()
      : asRecord(rawUserData);

  const statusRaw = String(data.status ?? root.status ?? "completed").toLowerCase();
  const status: NormalizedExecution["status"] =
    statusRaw === "completed" || statusRaw === "call-disconnected"
      ? "completed"
      : statusRaw.includes("no-answer") || statusRaw.includes("no_answer")
        ? "no_answer"
        : "error";

  return {
    executionId: str(data.id) ?? str(data.execution_id) ?? str(root.id) ?? str(root.execution_id),
    agentId: str(data.agent_id) ?? str(root.agent_id),
    status,
    turns,
    recordingUrl:
      str(data.recording_url) ??
      str(root.recording_url) ??
      str(telephony.recording_url),
    startedAt:
      str(data.created_at) ??
      str(data.initiated_at) ??
      str(root.created_at) ??
      new Date().toISOString(),
    durationMs,
    contactPhone:
      str(telephony.to_number) ??
      str(data.recipient_phone_number) ??
      str(root.recipient_phone_number) ??
      str(data.to_number),
    campaignId: str(userData?.campaign_id),
    contactId: str(userData?.contact_id),
  };
}

export function bolnaConfigured(): boolean {
  return Boolean(
    process.env.BOLNA_API_KEY && process.env.BOLNA_AGENT_ID && process.env.BOLNA_FROM_NUMBER,
  );
}

export interface PlaceCallInput {
  phone: string;
  campaignId: string;
  contactId: string;
  reference: string;
}

export interface PlaceCallResult {
  simulated: boolean;
  ok: boolean;
  executionId: string | null;
  status: string;
  message: string;
  raw?: unknown;
}

export async function placeCall(input: PlaceCallInput): Promise<PlaceCallResult> {
  if (!bolnaConfigured()) {
    return {
      simulated: true,
      ok: true,
      executionId: null,
      status: "simulated",
      message: "Bolna credentials are not configured. Gate passed; no real call was placed.",
    };
  }

  const base = (process.env.BOLNA_API_BASE ?? "https://api.bolna.ai").replace(/\/$/, "");
  try {
    const response = await fetch(`${base}/call`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.BOLNA_API_KEY}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(20_000),
      body: JSON.stringify({
        agent_id: process.env.BOLNA_AGENT_ID,
        recipient_phone_number: input.phone,
        from_phone_number: process.env.BOLNA_FROM_NUMBER,
        user_data: {
          campaign_id: input.campaignId,
          contact_id: input.contactId,
          pramaan_ref: input.reference,
        },
      }),
    });

    const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    return {
      simulated: false,
      ok: response.ok,
      executionId: str(body?.execution_id) ?? str(body?.id) ?? null,
      status: response.ok ? "queued" : "error",
      message: response.ok
        ? "Call queued through Bolna."
        : `Bolna rejected the call (${response.status}).`,
      raw: body ?? undefined,
    };
  } catch (error) {
    return {
      simulated: false,
      ok: false,
      executionId: null,
      status: "error",
      message: `Bolna request failed: ${(error as Error).message}`,
    };
  }
}
