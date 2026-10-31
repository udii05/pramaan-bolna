"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FilePlus2, Loader2, PenLine, Printer } from "lucide-react";

export function ReportActions({
  campaignId,
  reportId,
  persisted,
  signed,
}: {
  campaignId: string;
  reportId: string;
  persisted: boolean;
  signed: boolean;
}) {
  const router = useRouter();
  const [signedBy, setSignedBy] = useState("");
  const [busy, setBusy] = useState<"generate" | "sign" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setBusy("generate");
    setError(null);
    try {
      const response = await fetch(`/api/reports/${campaignId}`, { method: "POST" });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        setError(data?.error ?? "Could not generate the report.");
        return;
      }
      router.refresh();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function sign() {
    if (signedBy.trim().length < 2) {
      setError("Enter the signer's name.");
      return;
    }
    setBusy("sign");
    setError(null);
    try {
      const response = await fetch(`/api/reports/${campaignId}/sign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signedBy: signedBy.trim(), reportId }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        setError(data?.error ?? "Could not sign the report.");
        return;
      }
      setSignedBy("");
      router.refresh();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="no-print">
      <div className="flex flex-wrap items-center gap-2">
        {!persisted ? (
          <button type="button" onClick={generate} disabled={busy !== null} className="simple-primary-button">
            {busy === "generate" ? <Loader2 className="h-3 w-3 animate-spin" /> : <FilePlus2 className="h-3 w-3" />}
            Generate report
          </button>
        ) : null}

        {persisted && !signed ? (
          <>
            <input
              value={signedBy}
              onChange={(event) => setSignedBy(event.target.value)}
              placeholder="Compliance officer name"
              className="simple-field w-52"
            />
            <button type="button" onClick={sign} disabled={busy !== null} className="simple-primary-button">
              {busy === "sign" ? <Loader2 className="h-3 w-3 animate-spin" /> : <PenLine className="h-3 w-3" />}
              Sign report
            </button>
          </>
        ) : null}

        <button type="button" onClick={() => window.print()} className="simple-secondary-button">
          <Printer className="h-3 w-3" /> Print
        </button>
      </div>
      {error ? <p className="mt-1 text-[10px] text-[#a3463f]">{error}</p> : null}
    </div>
  );
}
