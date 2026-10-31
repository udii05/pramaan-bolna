# Pramaan — design

Date: 2026-10-25
Status: approved for build
Working title: Pramaan (प्रमाण, "proof")

## Intent

Pramaan is a compliance evidence layer for AI voice campaigns. A lender loads a collections
policy; Pramaan gates every outbound call before it dials and audits every completed transcript
after it ends, returning each violation with the clause, the verbatim quote, the audio timestamp
and a tamper-evident report a compliance officer can sign.

The product is not a legal oracle and does not interpret regulation. It enforces and evidences a
policy the customer owns.

## Why this exists

Bolna's calling guardrails control *when* outbound calls happen (allowed hours, timezone, auto
reschedule, bypass flag). They do not check *what the agent said*, whether consent and DND status
were on record, whether the mandatory AI disclosure was actually spoken, or whether the agent
threatened a borrower. Extractions can log structured fields after a call, but nothing checks a
transcript against a rule and produces a signable artifact.

Collections is Bolna's highest-value regulated use case. A compliance officer's question is not
"does the agent work" but "prove what it said, and prove you stopped it when it went wrong."

Bolna will not build this itself because it means owning legal liability. That is the wedge.

## Users

- **Compliance officer / risk lead** at an NBFC or collections agency. Signs reports, reviews
  findings, needs citations and evidence.
- **Campaign operations** at the same lender. Runs campaigns, needs a pre-dial gate and a
  circuit breaker.
- **Bolna** as distribution partner. Sells Pramaan to its BFSI customers; Pramaan is an add-on,
  not a competitor.

## Goals

1. Block ineligible dials deterministically before they happen: calling window, consent on
   record, DND status, attempt cap, disclosure present in the opening script.
2. Audit 100% of completed calls, not a sample.
3. Every finding is grounded in a verbatim quote that exists in the transcript, with a turn
   index, millisecond offset and confidence.
4. Produce a report whose integrity can be verified: per-call hashes chained to a report hash,
   plus signer and timestamp.
5. Stop a campaign automatically when a critical violation is found (circuit breaker).
6. Publish honest calibration: precision and recall per rule on a hand-labelled set, plus gate
   accuracy.
7. Run with zero external services for a pilot; swap in Postgres through one interface.

## Non-goals

- No real-time mid-call rewriting or blocking. Prevention happens before the dial; detection
  happens after the call; a human supervisor is the only in-call intervention.
- No legal advice, no claim of audit-readiness, no regulatory interpretation. Citations are
  references to verify, not counsel.
- No multi-tenant auth, RBAC, SSO or billing in this build.
- No custom model training, no fine-tuning, no audio processing.
- No dashboard beyond the campaign, call, rules, metrics and report views.
- No telephony of our own. Bolna owns the call.

## Anti-goals

- A dashboard that flags violations without evidence. If a finding cannot quote the transcript,
  it is dropped.
- A confidence number with no calibration behind it.
- A model in the hot path of a live call.
- A report that cannot be verified after the fact.

## Controls (v1)

| Code | Phase | Kind | Severity | What it checks |
|---|---|---|---|---|
| `CALL_WINDOW` | pre | deterministic | medium | Recipient-local time inside the policy window and on an allowed weekday |
| `CONTACT_ELIGIBILITY` | pre | deterministic | high | Consent granted and fresh, DND clean, attempts in 24h below cap |
| `AI_DISCLOSURE_IN_SCRIPT` | pre | deterministic | high | Opening script discloses that the caller is an AI |
| `AI_DISCLOSURE_SPOKEN` | post | deterministic | medium | Disclosure actually spoken in the first two agent turns |
| `NO_THIRD_PARTY_DISCLOSURE` | post | semantic | high | No debt, amount or loan reference before identity verification |
| `NO_PROHIBITED_CONDUCT` | post | semantic | critical | No threats, false legal claims, abuse, or pressure after opt-out |

Each rule carries a policy clause reference and a citation. The starter pack cites TRAI TCCCPR
(unsolicited commercial communication, DND, calling hours) and RBI recovery-conduct directions as
categories. Section-level citations must be verified against the primary source before any
customer use. The UI marks every citation "verify".

## Architecture

```
                    ┌──────────────────────────────┐
  contact + script  │  Gate (pre-dial)             │  allow / deny / reschedule
  ─────────────────▶│  window · consent · DND ·    │──────────────┐
                    │  cap · script disclosure     │              │
                    └──────────────────────────────┘              ▼
                                                          Bolna POST /call
                                                                  │
                                       completed webhook          │
                    ┌──────────────────────────────┐              │
                    │  Ingest                      │◀─────────────┘
                    │  normalize turns, hash       │
                    └──────────────┬───────────────┘
                                   ▼
                    ┌──────────────────────────────┐
                    │  Audit                       │
                    │  deterministic scanners      │
                    │  + optional LLM judge        │
                    │  + quote grounding           │
                    └──────────────┬───────────────┘
                                   ▼
              ┌────────────────────┴────────────────────┐
              ▼                                         ▼
   ┌─────────────────────┐                   ┌─────────────────────┐
   │ Circuit breaker     │                   │ Evidence chain      │
   │ pause campaign,     │                   │ per-call hashes →   │
   │ block contact       │                   │ report hash → sign  │
   └─────────────────────┘                   └─────────────────────┘
```

### Quote grounding

This is the core correctness mechanism. Every semantic finding must return a quote. The quote is
normalised (case, whitespace, punctuation) and must be a substring of a single turn's normalised
text. If it is not, the finding is dropped and an `audit` event records `ungrounded`. No
exceptions, including LLM output.

### Judge

Two modes, selected by `PRAMAAN_JUDGE`:

- `heuristic` (default): deterministic scanners over agent turns. Works offline, deterministic
  tests, no key. Labeled `heuristic` in every finding and in the report.
- `llm`: OpenAI-compatible chat completions, temperature 0, JSON object, 20s timeout. Findings
  are merged with deterministic findings and deduplicated by rule + turn. On any failure the run
  degrades to heuristic and the call records `degraded: true`.

Deterministic scanners always run. The LLM never replaces them.

### Circuit breaker

On audit completion, any `critical` finding pauses the campaign and blocks the contact. Pausing
does not cancel in-flight calls; it stops new dials and sets `pauseReason`. A human resumes from
the campaign page, which writes an audit event.

### Report integrity

For each call in the report period, in `startedAt` order:

```
findingsHash   = sha256(canonical JSON of stable finding fields)
transcriptHash = sha256(canonical JSON of turn index, role, text, startMs)
hash           = sha256({ callId, transcriptHash, findingsHash, prevHash })
prevHash       = previous entry's hash, or "GENESIS"
```

`reportHash = sha256({ campaignId, periodStart, periodEnd, callCount, lastHash, policyVersion,
engine })`. Signing adds `signedBy` and `signedAt` and re-hashes with them included. Verification
recomputes the chain from stored calls and findings and reports the first mismatch.

## Data model

- `Policy` — id, name, version, owner, disclaimer.
- `PolicyRule` — id, code, phase, kind, severity, clauseRef, citation, description, config.
- `Contact` — id, name, masked phone, phone hash, timezone, consent status/date, DND status,
  attempt timestamps, blocked flag.
- `Campaign` — id, name, client, agent name, status, script, policy id, contact ids, pause reason.
- `CallRecord` — id, Bolna execution id, campaign, contact, startedAt, duration, status, turns,
  recording URL, transcript hash, source, cost, auditedAt, engine.
- `Finding` — id, call, rule, severity, quote, turn index, startMs, confidence, reviewer status,
  engine, rationale.
- `Report` — id, campaign, period, counts, chain, report hash, signer, engine, policy version.
- `AuditEvent` — append-only log of gate, ingest, audit, breaker, review and report actions.

Storage is a single JSON file (`data/db.json`) behind `readDb` / `mutateDb`, written atomically
with a process-local mutex. The repository interface is the seam for Postgres.

## API

- `POST /api/gate` — evaluate a contact against pre-call rules. No dial.
- `POST /api/call` — gate, then dial through Bolna if configured; otherwise return a simulated
  result.
- `POST /api/webhooks/bolna` — ingest a completed execution, audit it, apply the breaker.
  Idempotent on execution id.
- `PATCH /api/findings/[id]` — reviewer status and note.
- `POST /api/campaigns/[id]/breaker` — pause or resume.
- `POST /api/reports/[campaignId]` — build a report.
- `POST /api/reports/[campaignId]/sign` — sign a report.
- `POST /api/seed` — reset and reseed demo data (development only).
- `GET /api/health` — environment and judge mode.

## Stack (builder's call)

Next.js 15 App Router, React 19, TypeScript strict, Tailwind 3.4, Zod, Vitest. No ORM, no
Postgres, no Python, no queue. Single app, file store, atomic writes. Chosen so the project runs
on a clean Windows machine with `npm install && npm run dev` and no Docker or credentials.

Audio is not processed or stored. Bolna's `recording_url` is used directly; timestamps come from
the transcript. If a recording is absent, findings still show turn-level offsets.

## Security and privacy

- Phone numbers are stored masked and hashed; the hash is what the gate uses for matching.
- Reports redact phone numbers by default.
- No audio is copied or persisted.
- The LLM judge, when enabled, receives transcripts. That must be disclosed to the customer and
  is why heuristic is the default. A production deployment needs a DPA and India-region routing.
- API routes do not authenticate in this build. That is a stated pilot limitation, not an
  oversight.

## Constraints

- Submission deadline: 2026-10-31. Build window: six days.
- One builder plus an agent.
- No production Bolna credentials required to run; the app seeds itself and works offline.
- Every claim shown in the UI must be computed from stored data, never hardcoded.

## Decisions made

- Evidence-first, not interception. Prevention is pre-dial and deterministic; in-call
  intervention is a human transfer, out of scope for v1.
- Policy, not law. Citations are references, never advice.
- Heuristic judge by default; LLM optional. Honest label on every finding.
- File store, not Postgres, for zero-setup. Repository interface is the swap point.
- Calibration on a hand-labelled set in-app, with undefined precision shown as "—" rather than a
  fabricated number.

## Left to the builder

- Section-level regulatory citations, verified against primary sources.
- Postgres adapter and auth before any multi-tenant deployment.
- A larger labelled corpus (target 300+ calls) and inter-annotator agreement.
- Live supervisor alerting via Bolna transfer-to-human.
- DND list integration at the provider level.
- A policy authoring UI; v1 edits the policy in code.
