# Pramaan — build plan

Deadline: 2026-10-31. One builder plus an agent. Six days.

## Phase 1 — Domain (day 1)

- Types, canonical JSON, SHA-256 helpers.
- Policy pack with six controls, clauses and citations.
- File store with atomic writes and a mutex; auto-seed on first read.
- Pre-call gate: window, consent/DND/attempt cap, script disclosure.
- Post-call scanners: disclosure spoken, third-party disclosure, prohibited conduct.
- Quote grounding and finding dedupe.
- Report chain, sign, verify.
- Unit tests for every rule, grounding, gate and hash chain.

Acceptance: `npm test` green; gate returns allow/deny/reschedule with reason codes; a transcript
with a threat produces one critical finding with a verbatim quote.

## Phase 2 — API (day 2)

- `/api/gate`, `/api/call` (Bolna or simulated), `/api/webhooks/bolna`.
- Tolerant transcript normaliser for Bolna payload shapes.
- Idempotent ingest on execution id.
- Circuit breaker on critical findings.
- Reviewer PATCH, report build/sign, seed, health.

Acceptance: posting a Bolna-shaped completed payload creates a call, audits it, creates findings
and pauses the campaign when critical; posting it twice creates one call.

## Phase 3 — UI (days 3–4)

- Shell, sidebar, dashboard KPIs.
- Calls list and call detail with transcript, findings, audio seek.
- Campaign list and detail with gate console and breaker control.
- Rules page with clauses and citations.
- Metrics page with per-rule precision/recall and gate accuracy.
- Report page with hash chain, sign form and print styles.

Acceptance: every page renders from seeded data with no client-side hardcoded numbers; finding
click seeks audio when a recording URL exists.

## Phase 4 — Calibration and data (day 5)

- 16 hand-labelled calls across compliant and violating cases, including negation and wrong-number
  edge cases.
- Gate labels for seeded contacts.
- Metrics computed at runtime from the labels.

Acceptance: precision/recall are computed, not typed; at least one rule shows an honest miss.

## Phase 5 — Verification and packaging (day 6)

- `npm test`, `npm run typecheck`, `npm run build`.
- Dev server smoke test on every route.
- README: setup, env, Bolna wiring, demo script, limitations.
- Optional: record the three-minute demo.

Acceptance: clean clone runs with `npm install && npm run dev`; build passes; every route returns
200; no secret in the repo.

## Cut list

Plain-language rule compiler, Hinglish semantic coverage beyond the curated lexicon, consent
capture flow, provider DND integration, PDF signing, live supervisor alerts, policy authoring UI.

## Risks

| Risk | Mitigation |
|---|---|
| LLM judge hallucinates a violation | Quote grounding drops any finding whose quote is not a verbatim substring |
| Heuristic false positives | Negation guard, curated phrases, calibration table shows the cost |
| Bolna payload shape differs | Tolerant normaliser plus a `simulated` source; webhook accepts partial payloads |
| File store corrupts on concurrent writes | Atomic temp-file rename plus a process mutex |
| Legal overclaim | Policy-not-law framing, "verify" badge on citations, disclaimer in report |
