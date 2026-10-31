"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import clsx from "clsx";
import type { Engine } from "@/lib/types";

export function JudgeToggle({
  initialMode,
  hasKey,
}: {
  initialMode: Engine;
  hasKey: boolean;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Engine>(initialMode);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function select(next: Engine) {
    if (next === mode) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/settings/judge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: next }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        setError(data?.message ?? "Could not switch the engine.");
        return;
      }
      setMode(next);
      router.refresh();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="inline-flex rounded-[6px] border border-[#d8e5e8] bg-[#f6fafb] p-0.5">
        <button
          type="button"
          onClick={() => select("heuristic")}
          disabled={busy}
          className={clsx(
            "rounded-[4px] px-3 py-1.5 text-[11px] font-semibold transition-colors",
            mode === "heuristic"
              ? "bg-[#0f7a8a] text-white"
              : "text-[#5c7379] hover:text-[#122f36]",
          )}
        >
          Heuristic
        </button>
        <button
          type="button"
          onClick={() => select("llm")}
          disabled={busy}
          className={clsx(
            "inline-flex items-center gap-1.5 rounded-[4px] px-3 py-1.5 text-[11px] font-semibold transition-colors",
            mode === "llm" ? "bg-[#0f7a8a] text-white" : "text-[#5c7379] hover:text-[#122f36]",
          )}
        >
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
          LLM judge
        </button>
      </div>

      {!hasKey ? (
        <p className="mt-2 text-[10px] leading-relaxed text-[#a85a1c]">
          No GEMINI_API_KEY set — the LLM judge is available but will degrade to heuristic until a
          key is added. Switching now is safe; it just won&apos;t call a model.
        </p>
      ) : (
        <p className="mt-2 text-[10px] leading-relaxed text-[#7d9197]">
          LLM findings are merged with the deterministic scanners and must still pass quote
          grounding. They are labelled <span className="font-mono">llm</span> everywhere.
        </p>
      )}
      {error ? <p className="mt-1 text-[10px] text-[#a3463f]">{error}</p> : null}
    </div>
  );
}
