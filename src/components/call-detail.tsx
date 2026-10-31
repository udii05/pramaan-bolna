"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Check,
  Clock3,
  FileText,
  Play,
  ShieldAlert,
  Volume2,
} from "lucide-react";
import clsx from "clsx";
import type { CallRecord, Finding, FindingStatus } from "@/lib/types";
import { Badge, SeverityBadge, StatusBadge } from "@/components/ui";
import { formatClock, formatDateTime, formatDuration } from "@/lib/format";

const STATUSES: FindingStatus[] = ["open", "upheld", "dismissed", "escalated"];

interface Props {
  call: CallRecord;
  findings: Finding[];
  campaign: { id: string; name: string; client: string } | null;
  contact: { id: string; name: string; phoneMasked: string; timeZone: string } | null;
  ruleTitles: Record<string, string>;
}

export function CallDetail({ call, findings, campaign, contact, ruleTitles }: Props) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [items, setItems] = useState(findings);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);

  const flaggedTurns = useMemo(() => {
    const map = new Map<number, Finding[]>();
    for (const finding of items) {
      const list = map.get(finding.turnIndex) ?? [];
      list.push(finding);
      map.set(finding.turnIndex, list);
    }
    return map;
  }, [items]);

  function playAt(finding: Finding) {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = Math.max(0, finding.startMs / 1000);
    setActiveId(finding.id);
    void audio.play();
  }

  async function updateStatus(finding: Finding, status: FindingStatus) {
    const previous = items;
    setItems((current) =>
      current.map((entry) => (entry.id === finding.id ? { ...entry, status } : entry)),
    );
    try {
      const response = await fetch(`/api/findings/${finding.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!response.ok) {
        setItems(previous);
        return;
      }
      setSavedId(finding.id);
      window.setTimeout(() => setSavedId(null), 1600);
    } catch {
      setItems(previous);
    }
  }

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <Link href="/calls" className="simple-back-link">
          <ArrowLeft className="h-4 w-4" />
          All calls
        </Link>
        <span className="font-mono text-[10px] text-[#7d9197]">
          {call.bolnaExecutionId ? `execution ${call.bolnaExecutionId}` : "seeded execution"}
        </span>
      </div>

      <header className="simple-page-header">
        <div>
          <p className="simple-eyebrow">Call audit</p>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-mono text-[clamp(22px,2.8vw,34px)] tracking-[-0.04em]">
              {call.id}
            </h1>
            <StatusBadge status={call.status} />
            <Badge tone={call.engine === "llm" ? "info" : "muted"}>
              {call.engine ?? "not audited"}
            </Badge>
            {call.degraded ? <Badge tone="warning">degraded</Badge> : null}
          </div>
          <p>
            {campaign ? (
              <Link href={`/campaigns/${campaign.id}`} className="text-[#0f6070] hover:underline">
                {campaign.name}
              </Link>
            ) : (
              "Unassigned campaign"
            )}
            {" · "}
            {contact
              ? `${contact.name} · ${contact.phoneMasked} · ${contact.timeZone}`
              : "Unknown contact"}
          </p>
        </div>
        <Link href={`/reports/${call.campaignId}`} className="simple-primary-button">
          <FileText />
          Open report
        </Link>
      </header>

      <div className="simple-facts">
        <div>
          <span>Started</span>
          <b>{formatDateTime(call.startedAt)}</b>
        </div>
        <div>
          <span>Duration</span>
          <b className="font-mono">{formatDuration(call.durationMs)}</b>
        </div>
        <div>
          <span>Findings</span>
          <b>{items.length} post-call</b>
        </div>
        <div>
          <span>Grounding</span>
          <b>verbatim quote required</b>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.55fr_1fr]">
        <section className="simple-card">
          <header className="simple-card-header">
            <div>
              <h2>Transcript</h2>
              <p>{call.turns.length} turns · timestamps in mm:ss</p>
            </div>
            {call.recordingUrl ? (
              <Badge tone="success">
                <Volume2 className="h-2.5 w-2.5" /> audio attached
              </Badge>
            ) : (
              <Badge tone="muted">no audio</Badge>
            )}
          </header>

          {call.recordingUrl ? (
            <div className="mb-3 rounded-[6px] border border-[#e1ecee] bg-[#f6fafb] px-3 py-3">
              <audio ref={audioRef} src={call.recordingUrl} controls className="w-full" preload="metadata" />
              <p className="mt-1.5 text-[10px] text-[#7d9197]">
                Audio is hosted by Bolna and streamed. Pramaan does not copy or store it.
              </p>
            </div>
          ) : (
            <div className="mb-3 flex items-center gap-2 rounded-[6px] border border-[#e1ecee] bg-[#f6fafb] px-3 py-2.5 text-[11px] text-[#657b81]">
              <Clock3 className="h-3 w-3 text-[#7d9197]" />
              No recording attached. Finding timestamps still resolve to the transcript turn.
            </div>
          )}

          <div className="overflow-hidden rounded-[6px] border border-[#e8f1f3]">
            {call.turns.map((turn) => {
              const turnFindings = flaggedTurns.get(turn.index) ?? [];
              const flagged = turnFindings.length > 0;
              const active = turnFindings.some((finding) => finding.id === activeId);
              return (
                <div
                  key={turn.index}
                  className={clsx(
                    "grid grid-cols-[52px_1fr] gap-3 border-b border-[#eef5f6] px-4 py-3 last:border-b-0",
                    flagged && "border-l-2 border-l-[#c5544b] bg-[#fdf6f5]",
                    active && "bg-[#fffaf5]",
                  )}
                >
                  <div className="pt-0.5">
                    <div className="font-mono text-[10px] text-[#7d9197]">
                      {formatClock(turn.startMs)}
                    </div>
                    <div className="mt-1 font-mono text-[9px] uppercase tracking-[0.06em] text-[#96aab0]">
                      {turn.role === "agent" ? "agent" : turn.role === "user" ? "caller" : turn.role}
                    </div>
                  </div>
                  <div>
                    <p className="text-[12px] leading-relaxed text-[#2f4a51]">{turn.text}</p>
                    {flagged ? (
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <ShieldAlert className="h-3 w-3 text-[#c5544b]" />
                        {turnFindings.map((finding) => (
                          <span key={finding.id} className="text-[10px] text-[#a3463f]">
                            {ruleTitles[finding.ruleCode] ?? finding.ruleCode}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <div className="space-y-4">
          <section className="simple-card">
            <header className="simple-card-header">
              <div>
                <h2>Findings</h2>
                <p>Every quote is verified against the turn before it is shown.</p>
              </div>
              <span className="font-mono text-[10px] text-[#7d9197]">{items.length}</span>
            </header>

            {items.length === 0 ? (
              <div className="rounded-[6px] border border-[#cfe7eb] bg-[#f4fafb] px-4 py-6 text-center">
                <div className="text-[12px] font-semibold text-[#0f6b7a]">No post-call findings</div>
                <p className="mx-auto mt-1 max-w-xs text-[11px] leading-relaxed text-[#657b81]">
                  The three post-call controls passed. Pre-dial controls are recorded against the
                  campaign gate, not the transcript.
                </p>
              </div>
            ) : (
              <div className="-mx-6 divide-y divide-[#eef5f6]">
                {items.map((finding) => (
                  <div key={finding.id} className="px-6 py-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <SeverityBadge severity={finding.severity} />
                        <span className="text-[11px] font-semibold text-[#1d353c]">
                          {ruleTitles[finding.ruleCode] ?? finding.ruleCode}
                        </span>
                      </div>
                      {savedId === finding.id ? (
                        <span className="inline-flex items-center gap-1 font-mono text-[9px] text-[#0f6b7a]">
                          <Check className="h-3 w-3" /> saved
                        </span>
                      ) : null}
                    </div>

                    <blockquote className="mt-2 rounded-[4px] border-l-2 border-[#d77522] bg-[#fffaf5] px-3 py-2 text-[11px] leading-relaxed text-[#3f5b62]">
                      “{finding.quote}”
                    </blockquote>
                    <p className="mt-2 text-[11px] leading-relaxed text-[#657b81]">
                      {finding.rationale}
                    </p>

                    <div className="mt-3 flex items-center gap-2">
                      <button
                        type="button"
                        disabled={!call.recordingUrl}
                        onClick={() => playAt(finding)}
                        className="simple-secondary-button"
                      >
                        <Play className="h-3 w-3" />
                        {formatClock(finding.startMs)}
                      </button>
                      <span className="font-mono text-[9px] text-[#7d9197]">
                        turn {finding.turnIndex} · {Math.round(finding.confidence * 100)}% ·{" "}
                        {finding.engine}
                      </span>
                    </div>

                    <div className="mt-3 flex items-center gap-2">
                      <select
                        value={finding.status}
                        onChange={(event) =>
                          updateStatus(finding, event.target.value as FindingStatus)
                        }
                        className="simple-field w-auto py-1 text-[10px]"
                      >
                        {STATUSES.map((status) => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ))}
                      </select>
                      <span className="text-[10px] text-[#7d9197]">reviewer status</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="simple-card">
            <p className="simple-card-label">Grounding</p>
            <p className="mt-2 text-[11px] leading-relaxed text-[#657b81]">
              A finding is only created when its quote appears verbatim in a single agent turn. This
              call produced {items.length} finding{items.length === 1 ? "" : "s"}; nothing ungrounded
              reached this page.
            </p>
            <div className="mt-3 space-y-2 border-t border-[#e8f1f3] pt-3">
              <div className="flex items-center justify-between gap-3 text-[10px]">
                <span className="text-[#7d9197]">Transcript hash</span>
                <span className="truncate font-mono text-[#3f5b62]" title={call.transcriptHash}>
                  {call.transcriptHash.slice(0, 18)}…
                </span>
              </div>
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-[#7d9197]">Audit engine</span>
                <span className="text-[#3f5b62]">{call.engine ?? "not audited"}</span>
              </div>
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-[#7d9197]">Audited at</span>
                <span className="text-[#3f5b62]">
                  {call.auditedAt ? formatDateTime(call.auditedAt) : "—"}
                </span>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
