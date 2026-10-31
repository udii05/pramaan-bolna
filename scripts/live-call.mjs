#!/usr/bin/env node
/**
 * Pramaan live-call helper.
 *
 * Places one real call through Bolna, waits for the execution to complete, and
 * feeds the execution JSON into Pramaan's webhook so it is audited, grounded
 * and playable end to end.
 *
 * Usage:
 *   node scripts/live-call.mjs +919XXXXXXXXX [--campaign camp-q3] [--contact c-01]
 *   node scripts/live-call.mjs --paste execution.json
 *
 * Required env (see .env.example):
 *   BOLNA_API_KEY, BOLNA_AGENT_ID, BOLNA_FROM_NUMBER
 * Optional env:
 *   BOLNA_API_BASE (default https://api.bolna.ai)
 *   PRAMAAN_BASE_URL (default http://localhost:3010)
 */

import { promises as fs } from "node:fs";

const args = process.argv.slice(2);
const pasteFile = args.includes("--paste") ? args[args.indexOf("--paste") + 1] : null;
const phone = args.find((arg) => arg.startsWith("+") || /^\d{10,}$/.test(arg));
const campaignId =
  args.includes("--campaign") ? args[args.indexOf("--campaign") + 1] : "camp-q3";
const contactId = args.includes("--contact") ? args[args.indexOf("--contact") + 1] : "c-01";

const BOLNA_BASE = (process.env.BOLNA_API_BASE ?? "https://api.bolna.ai").replace(/\/$/, "");
const PRAMAAN_BASE = (process.env.PRAMAAN_BASE_URL ?? "http://localhost:3010").replace(/\/$/, "");

function requireEnv() {
  const missing = ["BOLNA_API_KEY", "BOLNA_AGENT_ID", "BOLNA_FROM_NUMBER"].filter(
    (key) => !process.env[key],
  );
  if (missing.length > 0) {
    console.error(`Missing env: ${missing.join(", ")}. Copy .env.example to .env and fill it in.`);
    process.exit(1);
  }
}

async function postWebhook(payload) {
  const response = await fetch(`${PRAMAAN_BASE}/api/webhooks/bolna`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await response.json().catch(() => null);
  console.log(`\nWebhook -> ${response.status}`);
  console.log(JSON.stringify(body, null, 2));
  return body;
}

async function fetchExecution(executionId) {
  const candidates = [
    `${BOLNA_BASE}/execution/${executionId}`,
    `${BOLNA_BASE}/v1/execution/${executionId}`,
    `${BOLNA_BASE}/v2/execution/${executionId}`,
  ];
  for (const url of candidates) {
    try {
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${process.env.BOLNA_API_KEY}` },
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) continue;
      return await response.json();
    } catch {
      // try the next candidate
    }
  }
  return null;
}

async function placeAndPoll() {
  requireEnv();
  if (!phone) {
    console.error("Pass the recipient number, e.g. node scripts/live-call.mjs +919XXXXXXXXX");
    process.exit(1);
  }

  console.log(`Placing call to ${phone} via Bolna...`);
  const callResponse = await fetch(`${BOLNA_BASE}/call`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.BOLNA_API_KEY}`,
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(20_000),
    body: JSON.stringify({
      agent_id: process.env.BOLNA_AGENT_ID,
      recipient_phone_number: phone,
      from_phone_number: process.env.BOLNA_FROM_NUMBER,
      user_data: { campaign_id: campaignId, contact_id: contactId, pramaan_ref: "live-demo" },
    }),
  });
  const callBody = await callResponse.json().catch(() => null);
  if (!callResponse.ok) {
    console.error(`Bolna rejected the call (${callResponse.status}):`, callBody);
    process.exit(1);
  }
  const executionId = callBody?.execution_id ?? callBody?.id;
  console.log(`Queued. Execution id: ${executionId ?? "unknown"}`);
  if (!executionId) {
    console.error("No execution id returned. Use --paste with the execution JSON from the dashboard.");
    process.exit(1);
  }

  console.log("Waiting for the call to complete (answer the phone and talk to the agent)...");
  for (let attempt = 0; attempt < 30; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 5_000));
    const execution = await fetchExecution(executionId);
    const status = String(execution?.status ?? "").toLowerCase();
    process.stdout.write(`  status: ${status || "unknown"}\r`);
    if (status === "completed") {
      console.log("\nExecution completed. Posting to Pramaan...");
      return postWebhook(execution);
    }
    if (["no-answer", "no_answer", "failed", "error"].includes(status)) {
      console.error(`\nCall ended with status ${status}. Nothing to audit.`);
      process.exit(1);
    }
  }
  console.error(
    "\nTimed out waiting for completion. If the call finished late, fetch the execution JSON from the Bolna dashboard and run: node scripts/live-call.mjs --paste execution.json",
  );
  process.exit(1);
}

async function paste() {
  const raw = await fs.readFile(pasteFile, "utf8");
  const payload = JSON.parse(raw.replace(/^\uFEFF/, ""));
  if (payload && typeof payload === "object" && !Array.isArray(payload) && !payload.user_data) {
    payload.user_data = {
      campaign_id: campaignId,
      contact_id: contactId,
      pramaan_ref: "live-demo",
    };
  }
  console.log("Posting pasted execution to Pramaan...");
  return postWebhook(payload);
}

if (pasteFile) {
  await paste();
} else {
  await placeAndPoll();
}
