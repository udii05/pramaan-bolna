# Pramaan

**Compliance evidence for AI voice campaigns.**

Pramaan sits beside a Bolna voice campaign and does two things: it stops ineligible calls before
they dial, and it audits every completed transcript afterwards. Every finding carries the rule, the
clause, the verbatim quote, the audio timestamp and a hash-chained report a compliance officer can
sign.

Built for the [Bolna Buildathon](https://www.bolna.ai/symphony/buildathon), 2026.

> Pramaan enforces a customer-authored policy. It does not provide legal advice and does not
> certify regulatory compliance. Every citation in the starter pack is a category reference and
> must be verified against the primary source before use.

---

## Why this exists

Bolna's calling guardrails control **when** outbound calls happen: allowed hours, timezone, auto
reschedule, bypass flag. They do not check **what was said**, whether consent and DND status were on
record, whether the mandatory AI disclosure was actually spoken, or whether the agent threatened a
borrower. Extractions can log structured fields after a call, but nothing checks a transcript
against a rule and produces a signable artifact.

Collections is Bolna's highest-value regulated use case. The compliance officer's question is not
"does the agent work" but "prove what it said, and prove you stopped it when it went wrong."

## The six controls

| Code | Phase | Kind | Severity | What it checks |
|---|---|---|---|---|
| `CALL_WINDOW` | pre-dial | deterministic | medium | Recipient-local time inside the policy window |
| `CONTACT_ELIGIBILITY` | pre-dial | deterministic | high | Consent fresh, DND clean, attempt cap not reached |
| `AI_DISCLOSURE_IN_SCRIPT` | pre-dial | deterministic | high | Opening script discloses the AI |
| `AI_DISCLOSURE_SPOKEN` | post-call | deterministic | medium | Disclosure actually spoken in the first two agent turns |
| `NO_THIRD_PARTY_DISCLOSURE` | post-call | semantic | high | No debt or amount before identity verification |
| `NO_PROHIBITED_CONDUCT` | post-call | semantic | critical | No threats, false legal claims, abuse, or pressure after opt-out |

A critical finding trips the **circuit breaker**: the campaign pauses and the contact is blocked.

## How it works

```
contact + script ──▶ Gate ──▶ allow / deny / reschedule ──▶ Bolna POST /call
                       │
                       └── window · consent · DND · attempt cap · script disclosure

Bolna completed webhook ──▶ Ingest ──▶ Audit ──▶ quote grounding ──▶ findings
                                          │
                                          ├──▶ circuit breaker (critical)
                                          └──▶ evidence chain ──▶ report ──▶ sign
```

**Quote grounding is the core correctness mechanism.** A semantic finding is only accepted when its
quote appears verbatim in a single agent turn. If the model paraphrased, the finding is dropped and
an `ungrounded` event is recorded. There are no exceptions, including LLM output.

## Quick start

```bash
npm install
npm run dev
```

Open <http://localhost:3010>. No database, Docker, or credentials are required. On first read the
app seeds itself with 27 labelled calls, 22 contacts and 3 campaigns.

```bash
npm test          # 48 unit tests
npm run typecheck
npm run build
```

Reset the demo at any time:

```bash
curl -X POST http://localhost:3010/api/seed \
  -H "Content-Type: application/json" \
  -d '{"confirm":"reset"}'
```

## What the demo shows

1. **Overview** — 27 calls audited, 17 findings, one campaign paused by the breaker, calibration
   strip computed from the labelled corpus.
2. **Campaigns → Q3 personal loan collections** — run the pre-dial gate on different contacts:
   allow, DND deny, consent deny, attempt-cap deny, window reschedule. "Gate + dial" is simulated
   without Bolna credentials and real with them.
3. **Calls → call-004** — one critical conduct finding, with the quote highlighted in the turn.
   Click the timestamp to seek the recording when Bolna supplies one.
4. **Metrics** — precision, recall, true/false positives and the known false negative, computed at
   request time from the labels.
5. **Reports → Q3** — generate, verify the hash chain, sign, print.

## Bolna wiring

Copy `.env.example` to `.env` and fill in:

```env
BOLNA_API_KEY=
BOLNA_AGENT_ID=
BOLNA_FROM_NUMBER=
```

- `POST /api/call` evaluates the gate first. If the decision is not `allow`, it returns `422` and
  never calls Bolna. If Bolna is configured, the recipient phone must be supplied in the request;
  it is used for the dial and never stored.
- Point the agent's webhook at `POST /api/webhooks/bolna`. The handler accepts a completed execution
  payload, normalises array or string transcripts, audits, applies the breaker, and is idempotent on
  execution id.
- Intermediate statuses (`call-disconnected`, `in-progress`, `queued`, `ringing`) are ignored so the
  audit only runs on the final execution record.

Example payload:

```json
{
  "id": "exec-123",
  "status": "completed",
  "agent_id": "agent-abc",
  "conversation_duration": 42,
  "recording_url": "https://api.bolna.ai/recordings/...",
  "user_data": { "campaign_id": "camp-q3", "contact_id": "c-01" },
  "transcript": [
    { "role": "assistant", "content": "Namaste, main ek AI assistant hoon.", "start_time": 0, "end_time": 5 },
    { "role": "user", "content": "Haan boliye.", "start_time": 5, "end_time": 7 }
  ]
}
```

## Making one real call

The demo corpus is seeded text. To put a real, audible Bolna call through the system:

1. Copy `.env.example` to `.env` and fill in `BOLNA_API_KEY`, `BOLNA_AGENT_ID`,
   `BOLNA_FROM_NUMBER`. Credits are available from the Buildathon FAQ / Bolna Slack.
2. Point the agent's webhook at your machine: `ngrok http 3010`, then set the webhook URL in the
   Bolna dashboard to `https://<your-tunnel>/api/webhooks/bolna`. The webhook is idempotent on
   execution id, so retries are safe.
3. Place the call and let the script do the rest:

   ```bash
   node scripts/live-call.mjs +919XXXXXXXXX --campaign camp-q3 --contact c-01
   ```

   It queues the call, polls the execution until it completes, and posts the execution JSON into
   Pramaan. Answer the phone, talk to the agent, hang up — then refresh Calls: the new call is
   audited, its findings are grounded, and the recording plays from the finding timestamp.

4. If the polling path does not match your plan's API shape, use paste mode instead: make the call
   in the Bolna dashboard, open the execution, save its JSON, then:

   ```bash
   node scripts/live-call.mjs --paste execution.json
   ```

5. To attach a real recording to an existing call (for example a seeded one), use:

   ```bash
   curl -X POST http://localhost:3010/api/calls/call-004/recording \
     -H "Content-Type: application/json" \
     -d '{"recordingUrl": "https://api.bolna.ai/recordings/..."}'
   ```

## Audit judge

`PRAMAAN_JUDGE` selects the default, and the **Audit engine** card on the Policy pack page switches
it at runtime (stored in the app's settings, so the topbar reflects it):

- `heuristic` (default) — deterministic scanners over agent turns. Offline, reproducible, no key.
  Every finding is labelled `heuristic`.
- `llm` — Gemini free tier by default, through its OpenAI-compatible endpoint
  (`https://generativelanguage.googleapis.com/v1beta/openai`, model `gemini-3.5-flash-lite` — the
  current model Google recommends for new projects; `gemini-3.8-flash` is the higher-quality
  alternative). Gemini 2.0 is shut down and 2.5 is restricted to existing users, so do not use
  either. OpenAI is supported as a fallback. Temperature 0, JSON output, 20 second timeout. LLM
  findings are merged with deterministic findings and must pass quote grounding. On any failure the
  call is still audited heuristically and marked `degraded`. Switching to `llm` without
  `GEMINI_API_KEY` (or `OPENAI_API_KEY`) is refused with a clear message.

Deterministic scanners always run. The LLM never replaces them.

## Accuracy

From the seeded, hand-labelled corpus of 27 calls:

- Post-call precision **100%** (16 true positives, 0 false positives)
- Post-call recall **88.9%** (2 false negatives: `call-017` and `call-021`, implied threats
  outside the lexicon, left in on purpose)
- Gate accuracy **8/8**

These numbers are computed at request time by the same engine that audits production calls. They
are enough to catch a broken rule, not enough to claim production accuracy. Sixteen labelled calls
is the pilot corpus; the target is 300+ with inter-annotator agreement. The LLM mode is not
calibrated here and the UI says so.

## API

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/health` | Engine mode, Bolna status, counts |
| `POST` | `/api/gate` | Evaluate pre-dial controls, no dial |
| `POST` | `/api/call` | Gate, then dial through Bolna or simulate |
| `POST` | `/api/webhooks/bolna` | Ingest a completed execution, audit, breaker |
| `GET`/`POST` | `/api/settings/judge` | Read or switch the audit engine (heuristic / llm) |
| `POST` | `/api/calls/:id/recording` | Attach a real recording URL to a call |
| `PATCH` | `/api/findings/:id` | Reviewer status: open, upheld, dismissed, escalated |
| `POST` | `/api/campaigns/:id/breaker` | Pause or resume a campaign |
| `POST` | `/api/reports/:campaignId` | Build and store a report |
| `POST` | `/api/reports/:campaignId/sign` | Sign a stored report |
| `POST` | `/api/seed` | Reset demo data (`{"confirm":"reset"}`) |

## Report integrity

For each call in `startedAt` order:

```
findingsHash   = sha256(canonical JSON of stable finding fields)
transcriptHash = sha256(canonical JSON of index, role, text, startMs)
hash           = sha256({ callId, transcriptHash, findingsHash, prevHash })
prevHash       = previous hash, or "GENESIS"
reportHash     = sha256({ campaign, period, callCount, lastHash, policy, engine, signer })
```

Verification recomputes the chain from stored calls and findings and reports the first mismatch.
Reviewer status is deliberately excluded from the findings hash, so a review decision does not break
an already-generated report.

## Project structure

```
src/
  app/                 routes and pages
    api/               gate, call, webhook, findings, breaker, reports, seed, health
  components/          UI and client interactions
  lib/
    gate.ts            pre-dial controls
    rules/postcall.ts  deterministic scanners
    judge.ts           optional LLM judge
    audit.ts           merge, ground, dedupe
    report.ts          chain, sign, verify
    policy.ts          the six-control pack
    seed-data.ts       labelled corpus, contacts, campaigns
    metrics.ts         precision / recall / gate accuracy
    store.ts           atomic file store behind one interface
docs/
  plan.md
  demo.md
  superpowers/specs/2026-10-25-pramaan-design.md
```

## Design

The interface is a light evidence console: cool off-white page, white cards, teal blue for
allowed/verified, amber for reschedule, rose for a block. The mark is a verification seal with a
check, matching the "proof" in Pramaan. Type is Manrope for body copy, Departure Mono for
identifiers and micro-labels, and Times New Roman Italic for the editorial accent. The visual
language follows the light console pattern of the PayRevive Razorpay Buildathon project, but the
layout is its own: a top navigation bar with a larger seal mark, a two-column evidence dashboard,
and a review queue that sits beside campaign coverage instead of stacking under a row of summary
cards.

Departure Mono v1.500 by Helena Zhang is bundled locally under the SIL Open Font License; the
license is at `public/fonts/DepartureMono-LICENSE.txt`. Manrope is served from Google Fonts.
Times New Roman is a system font and is not redistributed.

## Decisions

- **Evidence-first, not interception.** Inline rewriting adds latency to every turn and cannot be
  measured for recall. Prevention is pre-dial and deterministic; in-call intervention is a human
  transfer, out of scope for v1.
- **Policy, not law.** Citations are references to verify, never advice.
- **Heuristic by default; LLM optional.** Honest label on every finding.
- **File store, not Postgres.** Zero setup for a pilot. `readDb` / `mutateDb` in `store.ts` is the
  swap point.
- **No audio storage.** Bolna's `recording_url` is streamed; only the transcript hash is persisted.

## Limitations

- API routes are unauthenticated. This is a pilot build; add auth and RBAC before multi-tenant use.
- Phone numbers are stored masked and hashed, but the gate does not integrate a live DND registry.
- The heuristic lexicon is curated for Hinglish collections; it will miss novel phrasings. That is
  visible in the calibration, not hidden.
- Section-level regulatory citations are not included. Verify the categories against TRAI and RBI
  primary sources before any customer deployment.
- No PDF signature. The report is printed from the browser and the hash chain is verifiable in-app.
