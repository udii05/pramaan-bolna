# Pramaan — three-minute demo

## Before you start

```bash
npm run dev
```

Open <http://localhost:3010>. If the attempt-cap contact has aged out of the 24-hour window, reset
the seed with `curl -X POST http://localhost:3010/api/seed -H "Content-Type: application/json" -d '{"confirm":"reset"}'`.

If Bolna credentials are present, the dial button places a real call. If not, it simulates and the
gate is still real. Say which one is happening. Never claim a simulated dial was live.

**The money shot.** If you have credentials, place the real call first (README → Making one real
call), then open the video with the agent actually speaking on the phone, cut to Calls, and play the
flagged sentence. A dashboard is a demo; a voice saying the violation is the proof.

## The script

**0:00 — the problem, one sentence.**

> An NBFC runs 40,000 collections calls a month. A compliance officer has to sign off on them.
> Today that means listening to a sample and hoping.

**0:20 — prevention, on the campaign page.**

Open **Campaigns → Q3 personal loan collections**. Pick contacts and run the gate:

- Priya Sharma → **allow**
- Rakesh Verma → **deny, DND listed**
- Imran Qureshi → **deny, consent missing**
- Sunita Devi → **deny, attempt cap**
- Daniel Mathew → **reschedule, outside his local window**
- The festive campaign → **deny, the opening script has no AI disclosure**

> Bolna's guardrails control when a call happens. These five controls decide whether it happens at
> all, and they are deterministic. No model, no latency, no guessing.

**1:00 — detection, on a call.**

Open **Calls → call-004**.

> The agent verified identity, then said: "Agar aaj payment nahi hua to hum police bhej denge."
> The quote is highlighted in the transcript. The finding is critical, so the breaker paused the
> campaign and blocked the contact. That is the campaign page you saw a minute ago.

Click the timestamp. If a recording is attached, audio seeks to the sentence.

Then open **Calls → call-018** to show the same rule firing twice in one call: a threat in one turn,
abuse in a later one. Both are reported, not just the first. That is the difference between a
keyword filter and an audit.

**1:40 — evidence, on the report.**

Open **Reports → Q3 personal loan collections**.

> Every finding carries the clause, the quote and the timestamp. Every call is hashed into a chain.
> The report hash covers the chain. A compliance officer signs once, and the artifact can be
> verified later without trusting us.

Generate the report, then sign it with a name. Point at the chain: `GENESIS` on the first row, each
row carrying the previous hash.

**2:20 — the number.**

Open **Calibration**.

> 27 hand-labelled calls, 16 true positives, no false positives, two known false negatives: implied
> threats the lexicon does not catch. We left them in. Gate accuracy is 8 of 8. These numbers are
> computed by the same engine that audits production calls, not typed into a slide.

**2:35 — the AI layer.**

Open **Policy pack → Audit engine**, switch to **LLM judge**.

> The deterministic scanners are the floor. The LLM is additive, and every LLM finding still has to
> pass quote grounding before it is shown. This is AI auditing AI voice — with a receipt.

**2:50 — close.**

> Prevention where it is reliable, detection everywhere, evidence that survives an inquiry. Bolna
> sells the call. Pramaan proves it was a compliant one.

## Questions a judge will ask

**"Why won't Bolna build this?"**
Because it means owning legal liability and interpreting a customer's policy. Bolna sells
infrastructure. Pramaan is the evidence layer a lender's compliance team signs. It is a partner, not
a competitor; it unblocks enterprise deals.

**"Isn't this just extractions?"**
Extractions log fields. They do not check a rule, ground a quote, cite a clause, pause a campaign,
or produce a verifiable report. The hard part is the policy pack, the grounding verifier and the
calibration, not the LLM call.

**"Why not block the sentence mid-call?"**
You cannot un-say a word, so you must buffer, which adds latency to every turn — and the checks fast
enough to sit inline miss paraphrased threats. Worse, you cannot measure recall on a sentence that
was never spoken. We put the deterministic controls before the dial and the semantic audit after the
call, where both can be measured.

**"What about false positives?"**
Visible. The calibration page lists every disagreement with the hand labels. Zero false positives,
one false negative on this corpus. The lexicon is deliberately conservative and the target is 300+
labels with inter-annotator agreement.

**"Is this legally compliant?"**
No claim. Pramaan enforces a customer-authored policy and produces evidence. It does not interpret
law. Every citation is marked "verify" and the disclaimer is in the report.

**"What is the business model?"**
Per-audited-1,000-calls fee plus a subscription for custom policy packs, sold through Bolna as an
add-on. A compliance analyst samples 2% of calls; Pramaan audits 100%.

**"What did you cut?"**
Live supervisor alerting, policy authoring UI, provider DND integration, PDF signing, and the
plain-language rule compiler. All are listed in the design doc.
