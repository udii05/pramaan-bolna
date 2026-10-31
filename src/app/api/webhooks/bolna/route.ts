import { NextResponse } from "next/server";
import { readDb, mutateDb } from "@/lib/store";
import { normalizeBolnaExecution } from "@/lib/bolna";
import { auditCall, isCritical } from "@/lib/audit";
import { hashJson, hashTranscript, sha256 } from "@/lib/hash";
import { newId } from "@/lib/ids";
import type { CallRecord } from "@/lib/types";

export const runtime = "nodejs";

function phoneCandidates(phone: string | null): string[] {
  if (!phone) return [];
  const digits = phone.replace(/\D/g, "");
  return digits ? [phone, `+${digits}`, digits] : [phone];
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const rawStatus = String(
    (body as Record<string, unknown>)?.status ??
      ((body as Record<string, unknown>)?.data as Record<string, unknown> | undefined)?.status ??
      "",
  ).toLowerCase();
  if (["call-disconnected", "in-progress", "queued", "ringing", "initiated"].includes(rawStatus)) {
    return NextResponse.json({ ok: true, ignored: true, status: rawStatus });
  }

  const normalized = normalizeBolnaExecution(body);
  const executionId =
    normalized.executionId ?? `unidentified-${hashJson(body).slice(0, 12)}`;

  const db = await readDb();
  const duplicate = db.calls.find((call) => call.bolnaExecutionId === executionId);
  if (duplicate) {
    return NextResponse.json({
      ok: true,
      duplicate: true,
      callId: duplicate.id,
      findings: db.findings.filter((finding) => finding.callId === duplicate.id).length,
    });
  }

  const phoneHashes = new Set(phoneCandidates(normalized.contactPhone).map((phone) => sha256(phone)));
  const contact =
    db.contacts.find((entry) => entry.id === normalized.contactId) ??
    db.contacts.find((entry) => phoneHashes.has(entry.phoneHash)) ??
    null;

  const campaign =
    db.campaigns.find((entry) => entry.id === normalized.campaignId) ??
    db.campaigns.find((entry) => contact && entry.contactIds.includes(contact.id)) ??
    db.campaigns[0] ??
    null;

  if (!campaign) {
    return NextResponse.json({ error: "no_campaign" }, { status: 409 });
  }

  const call: CallRecord = {
    id: `call-${executionId}`,
    bolnaExecutionId: executionId,
    campaignId: campaign.id,
    contactId: contact?.id ?? null,
    agentId: normalized.agentId,
    startedAt: normalized.startedAt,
    durationMs: normalized.durationMs,
    status: normalized.status,
    turns: normalized.turns,
    recordingUrl: normalized.recordingUrl,
    transcriptHash: hashTranscript(normalized.turns),
    source: "bolna",
    costInr: null,
    auditedAt: null,
    engine: null,
    degraded: false,
  };

  const shouldAudit = normalized.status === "completed" && normalized.turns.length > 0;
  const audit = shouldAudit ? await auditCall(call, db.rules, new Date(), db.settings?.judgeMode) : null;
  if (audit) {
    call.auditedAt = new Date().toISOString();
    call.engine = audit.engine;
    call.degraded = audit.degraded;
  }

  const result = await mutateDb((current) => {
    const raced = current.calls.find((entry) => entry.bolnaExecutionId === executionId);
    if (raced) return { duplicate: true, callId: raced.id, findings: 0, breaker: false };

    current.calls.push(call);
    if (audit) current.findings.push(...audit.findings);
    current.events.push({
      id: newId("evt"),
      at: new Date().toISOString(),
      type: "ingest",
      message: `Ingested ${executionId} (${normalized.turns.length} turns, source bolna).`,
      callId: call.id,
      campaignId: campaign.id,
    });
    if (audit) {
      current.events.push({
        id: newId("evt"),
        at: new Date().toISOString(),
        type: "audit",
        message: `Audited ${call.id}: ${audit.findings.length} finding(s), engine ${audit.engine}${
          audit.degraded ? " (degraded)" : ""
        }, ${audit.droppedUngrounded} ungrounded dropped.`,
        callId: call.id,
        campaignId: campaign.id,
      });
    }

    let breaker = false;
    if (audit && isCritical(audit.findings)) {
      breaker = true;
      const targetCampaign = current.campaigns.find((entry) => entry.id === campaign.id);
      if (targetCampaign) {
        targetCampaign.status = "paused";
        targetCampaign.pauseReason = `Critical finding on ${call.id}: ${audit.findings
          .filter((finding) => finding.severity === "critical")
          .map((finding) => finding.ruleCode)
          .join(", ")}.`;
      }
      if (contact) {
        const targetContact = current.contacts.find((entry) => entry.id === contact.id);
        if (targetContact) {
          targetContact.blocked = true;
          targetContact.blockReason = `Blocked after critical finding on ${call.id}.`;
        }
      }
      current.events.push({
        id: newId("evt"),
        at: new Date().toISOString(),
        type: "breaker",
        message: `Circuit breaker paused ${campaign.name} and blocked ${
          contact?.name ?? "the contact"
        }.`,
        callId: call.id,
        campaignId: campaign.id,
      });
    }

    return {
      duplicate: false,
      callId: call.id,
      findings: audit?.findings.length ?? 0,
      breaker,
    };
  });

  return NextResponse.json({ ok: true, ...result, engine: audit?.engine ?? null });
}
