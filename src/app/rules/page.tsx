import { readDb } from "@/lib/store";
import { Badge, SeverityBadge } from "@/components/ui";
import { JudgeToggle } from "@/components/judge-toggle";
import { hasApiKey } from "@/lib/judge";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

function configSummary(config: Record<string, unknown>): string {
  return Object.entries(config)
    .map(([key, value]) => {
      if (Array.isArray(value)) return `${key}: ${value.length} terms`;
      return `${key}: ${String(value)}`;
    })
    .join(" · ");
}

export default async function RulesPage() {
  const db = await readDb();
  const preCall = db.rules.filter((rule) => rule.phase === "pre_call");
  const postCall = db.rules.filter((rule) => rule.phase === "post_call");
  const mode = db.settings?.judgeMode ?? "heuristic";

  return (
    <div>
      <header className="simple-page-header">
        <div>
          <p className="simple-eyebrow">Policy pack</p>
          <div className="flex flex-wrap items-center gap-2">
            <h1>{db.policy.name}</h1>
            <Badge tone="amber">v{db.policy.version}</Badge>
          </div>
          <p>
            Owner {db.policy.owner} · created {formatDate(db.policy.createdAt)} · six controls. The
            customer writes the policy; Pramaan enforces it and produces the evidence.
          </p>
        </div>
        <span className="simple-data-badge sample">Citations require verification</span>
      </header>

      <div
        className="simple-notice"
        style={{ color: "#a85a1c", background: "#fff7ed", borderColor: "#f0d2b6" }}
      >
        <span className="font-mono text-[9px] uppercase tracking-[0.08em]">Not legal advice</span>
        <span className="text-[11px] leading-relaxed">{db.policy.disclaimer}</span>
      </div>

      <div className="simple-facts">
        <div>
          <span>Pre-dial controls</span>
          <b>{preCall.length} deterministic</b>
        </div>
        <div>
          <span>Post-call controls</span>
          <b>{postCall.length} grounded</b>
        </div>
        <div>
          <span>Engine</span>
          <b>{mode === "llm" ? (hasApiKey() ? "LLM + rules" : "LLM (no key)") : "Heuristic"}</b>
        </div>
        <div>
          <span>Owner</span>
          <b>{db.policy.owner}</b>
        </div>
      </div>

      <section className="simple-card">
        <div className="simple-card-header">
          <div>
            <h2>Audit engine</h2>
            <p>
              Deterministic scanners always run. The LLM judge is additive and optional — switch it
              on to show AI auditing AI voice.
            </p>
          </div>
          <Badge tone={mode === "llm" && hasApiKey() ? "info" : "muted"}>
            {mode === "llm" ? "LLM" : "Heuristic"}
          </Badge>
        </div>
        <JudgeToggle initialMode={mode} hasKey={hasApiKey()} />
      </section>

      <section>
        <div className="simple-section-title">
          <div>
            <p className="simple-eyebrow">Controls</p>
            <h2>What the policy actually checks</h2>
            <p className="simple-section-copy">
              Each rule carries a clause, a citation to verify, and an explicit check kind.
            </p>
          </div>
          <span className="simple-data-badge">{db.rules.length} controls</span>
        </div>

        <div className="space-y-4">
          {db.rules.map((rule, index) => (
            <article key={rule.id} className="simple-card">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <span className="grid h-7 w-7 flex-none place-items-center rounded-full bg-[#106c7c] font-mono text-[10px] text-white">
                    {index + 1}
                  </span>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-[15px] font-bold tracking-[-0.03em] text-[#1d353c]">
                        {rule.title}
                      </h3>
                      <SeverityBadge severity={rule.severity} />
                    </div>
                    <div className="mt-1 font-mono text-[9px] uppercase tracking-[0.06em] text-[#7d9197]">
                      {rule.code} · {rule.clauseRef} · {rule.phase === "pre_call" ? "pre-dial" : "post-call"}
                    </div>
                  </div>
                </div>
                <Badge tone={rule.kind === "deterministic" ? "success" : "amber"}>
                  {rule.kind}
                </Badge>
              </div>

              <p className="mt-3 max-w-4xl text-[12px] leading-relaxed text-[#556c72]">
                {rule.description}
              </p>

              <div className="mt-4 grid gap-3 md:grid-cols-[1.2fr_1fr]">
                <div className="rounded-[6px] border border-[#e8f1f3] bg-[#f6fafb] px-3 py-2.5">
                  <div className="font-mono text-[9px] uppercase tracking-[0.08em] text-[#7d9197]">
                    Citation
                  </div>
                  <div className="mt-1 text-[11px] text-[#3f5b62]">{rule.citation}</div>
                  <div className="mt-1 text-[10px] text-[#7d9197]">{rule.citationNote}</div>
                </div>
                <div className="rounded-[6px] border border-[#e8f1f3] bg-[#f6fafb] px-3 py-2.5">
                  <div className="font-mono text-[9px] uppercase tracking-[0.08em] text-[#7d9197]">
                    Parameters
                  </div>
                  <div className="mt-1 break-words font-mono text-[10px] leading-relaxed text-[#657b81]">
                    {configSummary(rule.config)}
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="simple-process-section">
        <div className="simple-section-title">
          <div>
            <p className="simple-eyebrow">How the decisions are made</p>
            <h2>Three rules that keep the policy honest.</h2>
          </div>
        </div>
        <ol className="simple-process">
          <li>
            <b>1</b>
            <div>
              <strong>Decision precedence</strong>
              <span>
                A hard pre-dial failure denies. Otherwise a closed window reschedules. Otherwise the
                dial is allowed. A paused campaign or blocked contact always denies.
              </span>
            </div>
          </li>
          <li>
            <b>2</b>
            <div>
              <strong>Grounding rule</strong>
              <span>
                Every post-call finding must quote a single agent turn verbatim. A paraphrase is
                dropped before it reaches the queue, with no exception for LLM output.
              </span>
            </div>
          </li>
          <li>
            <b>3</b>
            <div>
              <strong>Breaker rule</strong>
              <span>
                Any critical finding pauses the campaign and blocks the contact. High and medium
                findings enter review without stopping the campaign.
              </span>
            </div>
          </li>
        </ol>
      </section>
    </div>
  );
}
