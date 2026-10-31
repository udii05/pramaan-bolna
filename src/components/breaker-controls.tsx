"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pause, Play } from "lucide-react";

export function BreakerControls({
  campaignId,
  status,
}: {
  campaignId: string;
  status: "active" | "paused" | "completed";
}) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function act(action: "pause" | "resume") {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/breaker`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reason: reason.trim() || undefined }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        setError(data?.error ?? "Request failed.");
        return;
      }
      setReason("");
      router.refresh();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {status === "paused" ? (
        <button type="button" onClick={() => act("resume")} disabled={busy} className="simple-primary-button">
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
          Resume campaign
        </button>
      ) : (
        <div className="space-y-2">
          <input
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Reason (optional)"
            className="simple-field"
          />
          <button
            type="button"
            onClick={() => act("pause")}
            disabled={busy}
            className="simple-secondary-button"
            style={{ borderColor: "#f0cecb", color: "#a3463f", background: "#fdf6f5" }}
          >
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Pause className="h-3 w-3" />}
            Pause campaign
          </button>
        </div>
      )}
      <p className="mt-2 text-[10px] leading-relaxed text-[#7d9197]">
        Resuming clears the campaign pause. Contacts blocked by a critical finding stay blocked until
        a reviewer clears them.
      </p>
      {error ? <p className="mt-1 text-[10px] text-[#a3463f]">{error}</p> : null}
    </div>
  );
}
