"use client";

import { useState } from "react";
import {
  CheckCircle2,
  Clock3,
  Loader2,
  PhoneCall,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import type { GateResult } from "@/lib/types";
import { Badge, DecisionBadge } from "@/components/ui";
import { formatDateTime } from "@/lib/format";

interface GateContact {
  id: string;
  name: string;
  phoneMasked: string;
  consentStatus: string;
  dndStatus: string;
  attempts24h: number;
  blocked: boolean;
}

interface GateResponse {
  gate: GateResult;
  contact: { id: string; name: string; phoneMasked: string; timeZone: string };
  campaign: { id: string; name: string; status: string };
}

interface DialResult {
  simulated: boolean;
  ok: boolean;
  executionId: string | null;
  status: string;
  message: string;
}

export function GateConsole({
  campaignId,
  contacts,
  bolnaConfigured,
}: {
  campaignId: string;
  contacts: GateContact[];
  bolnaConfigured: boolean;
}) {
  const [contactId, setContactId] = useState(contacts[0]?.id ?? "");
  const [phone, setPhone] = useState("");
  const [result, setResult] = useState<GateResponse | null>(null);
  const [dial, setDial] = useState<DialResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"gate" | "dial" | null>(null);

  const selected = contacts.find((contact) => contact.id === contactId);

  async function run(mode: "gate" | "dial") {
    setBusy(mode);
    setError(null);
    setDial(null);
    if (mode === "gate") setResult(null);

    try {
      const response = await fetch(mode === "gate" ? "/api/gate" : "/api/call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactId,
          campaignId,
          ...(mode === "dial" && phone.trim() ? { phone: phone.trim() } : {}),
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        if (data?.gate) {
          setResult({
            gate: data.gate,
            contact: { id: contactId, name: "", phoneMasked: "", timeZone: "" },
            campaign: { id: campaignId, name: "", status: "" },
          });
        }
        setError(
          data?.message ??
            (data?.error === "phone_required"
              ? "Bolna is configured. Enter the recipient number to dial."
              : "The gate blocked this call. Resolve the failing checks first."),
        );
        return;
      }

      if (mode === "gate") {
        setResult(data as GateResponse);
      } else {
        setResult({
          gate: data.gate,
          contact: { id: contactId, name: "", phoneMasked: "", timeZone: "" },
          campaign: { id: campaignId, name: "", status: "" },
        });
        setDial(data.dial as DialResult);
      }
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="simple-card">
      <header className="simple-card-header">
        <div>
          <h2>Pre-dial gate</h2>
          <p>Five controls evaluated before the call leaves the building. No model in the path.</p>
        </div>
        <Badge tone="success">
          <ShieldCheck className="h-2.5 w-2.5" /> deterministic
        </Badge>
      </header>

      <div className="grid gap-3 md:grid-cols-[1.4fr_1fr]">
        <div>
          <label className="mb-1 block font-mono text-[9px] uppercase tracking-[0.08em] text-[#758b91]" htmlFor="gate-contact">
            Contact
          </label>
          <select
            id="gate-contact"
            value={contactId}
            onChange={(event) => {
              setContactId(event.target.value);
              setResult(null);
              setDial(null);
              setError(null);
            }}
            className="simple-field"
          >
            {contacts.map((contact) => (
              <option key={contact.id} value={contact.id}>
                {contact.name} · {contact.phoneMasked}
              </option>
            ))}
          </select>
          {selected ? (
            <p className="mt-1.5 text-[10px] text-[#7d9197]">
              {selected.blocked
                ? "Blocked by a prior critical finding."
                : `Consent ${selected.consentStatus} · DND ${selected.dndStatus} · ${selected.attempts24h} attempts in 24h`}
            </p>
          ) : null}
        </div>

        <div>
          <label className="mb-1 block font-mono text-[9px] uppercase tracking-[0.08em] text-[#758b91]" htmlFor="gate-phone">
            Recipient number {bolnaConfigured ? "(required to dial)" : "(optional)"}
          </label>
          <input
            id="gate-phone"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            placeholder="+9198…"
            inputMode="tel"
            className="simple-field font-mono"
          />
          <p className="mt-1.5 text-[10px] text-[#7d9197]">
            Used only for the dial request. Pramaan stores the masked number and a hash.
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => run("gate")}
          disabled={busy !== null || !contactId}
          className="simple-secondary-button"
        >
          {busy === "gate" ? <Loader2 className="h-3 w-3 animate-spin" /> : <ShieldCheck className="h-3 w-3" />}
          Evaluate gate
        </button>
        <button
          type="button"
          onClick={() => run("dial")}
          disabled={busy !== null || !contactId}
          className="simple-primary-button"
        >
          {busy === "dial" ? <Loader2 className="h-3 w-3 animate-spin" /> : <PhoneCall className="h-3 w-3" />}
          Gate + dial
        </button>
        {!bolnaConfigured ? (
          <span className="font-mono text-[9px] text-[#7d9197]">
            Bolna credentials absent — the dial is simulated, the gate is real.
          </span>
        ) : null}
      </div>

      {error ? (
        <div className="simple-notice error mt-4">
          <XCircle className="h-4 w-4" />
          {error}
        </div>
      ) : null}

      {result ? (
        <div className="mt-4 border-t border-[#e8f1f3] pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <DecisionBadge decision={result.gate.decision} />
            <span className="font-mono text-[10px] text-[#657b81]">
              evaluated {formatDateTime(result.gate.evaluatedAt)}
            </span>
            {result.gate.nextWindow ? (
              <span className="font-mono text-[10px] text-[#ae611b]">
                next window {formatDateTime(result.gate.nextWindow)}
              </span>
            ) : null}
          </div>

          <div className="mt-3">
            {result.gate.checks.map((check) => {
              const Icon = check.ok
                ? CheckCircle2
                : check.code === "WINDOW_CLOSED"
                  ? Clock3
                  : XCircle;
              const tone = check.ok ? "ok" : check.code === "WINDOW_CLOSED" ? "warn" : "fail";
              return (
                <div key={check.code} className={`simple-gate-check ${tone}`}>
                  <Icon
                    className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${
                      check.ok ? "text-[#0f7a8a]" : check.code === "WINDOW_CLOSED" ? "text-[#d77522]" : "text-[#c5544b]"
                    }`}
                  />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-mono text-[9px] text-[#7d9197]">{check.code}</span>
                      <span className="text-[11px] text-[#2f4a51]">{check.message}</span>
                    </div>
                    {check.detail ? (
                      <p className="mt-0.5 truncate text-[10px] text-[#7d9197]" title={check.detail}>
                        {check.detail}
                      </p>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>

          {dial ? (
            <div className="mt-3 rounded-[6px] border border-[#e8f1f3] bg-[#f6fafb] px-3 py-2 text-[11px] text-[#3f5b62]">
              <span className="text-[#7d9197]">{dial.simulated ? "Simulated" : "Bolna"}:</span>{" "}
              {dial.message}
              {dial.executionId ? (
                <span className="ml-1 font-mono text-[10px] text-[#657b81]">{dial.executionId}</span>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="mt-6 grid gap-2 border-t border-[#e8f1f3] pt-4 sm:grid-cols-3">
        {[
          { label: "Deny", text: "Consent, DND, attempt cap or script disclosure fails." },
          { label: "Reschedule", text: "Outside the recipient's local calling window." },
          { label: "Allow", text: "All five controls pass, then the call is placed." },
        ].map((item) => (
          <div
            key={item.label}
            className="rounded-[6px] border border-[#e8f1f3] bg-[#f8fcfd] px-3 py-2"
          >
            <div className="font-mono text-[9px] uppercase tracking-[0.06em] text-[#7d9197]">
              {item.label}
            </div>
            <p className="mt-1 text-[10px] leading-relaxed text-[#657b81]">{item.text}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
