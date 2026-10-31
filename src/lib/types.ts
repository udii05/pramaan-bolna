export type Severity = "info" | "low" | "medium" | "high" | "critical";

export type FindingStatus = "open" | "upheld" | "dismissed" | "escalated";

export type RulePhase = "pre_call" | "post_call";

export type RuleKind = "deterministic" | "semantic";

export type Engine = "heuristic" | "llm";

export type TurnRole = "agent" | "user" | "system";

export interface Turn {
  index: number;
  role: TurnRole;
  text: string;
  startMs: number;
  endMs: number;
}

export interface Policy {
  id: string;
  name: string;
  version: string;
  owner: string;
  createdAt: string;
  disclaimer: string;
}

export interface PolicyRule {
  id: string;
  code: string;
  title: string;
  phase: RulePhase;
  kind: RuleKind;
  severity: Severity;
  clauseRef: string;
  citation: string;
  citationNote: string;
  description: string;
  config: Record<string, unknown>;
}

export interface Contact {
  id: string;
  name: string;
  phoneMasked: string;
  phoneHash: string;
  timeZone: string;
  consentStatus: "granted" | "missing" | "expired" | "revoked";
  consentCapturedAt: string | null;
  dndStatus: "clean" | "listed" | "unknown";
  attempts: string[];
  blocked: boolean;
  blockReason?: string;
}

export interface Campaign {
  id: string;
  name: string;
  client: string;
  agentName: string;
  status: "active" | "paused" | "completed";
  script: string;
  policyId: string;
  contactIds: string[];
  pauseReason?: string;
  createdAt: string;
}

export interface CallRecord {
  id: string;
  bolnaExecutionId: string | null;
  campaignId: string;
  contactId: string | null;
  agentId: string | null;
  startedAt: string;
  durationMs: number;
  status: "completed" | "no_answer" | "error";
  turns: Turn[];
  recordingUrl: string | null;
  transcriptHash: string;
  source: "bolna" | "seed" | "simulated";
  costInr: number | null;
  auditedAt: string | null;
  engine: Engine | null;
  degraded: boolean;
}

export interface Finding {
  id: string;
  callId: string;
  ruleId: string;
  ruleCode: string;
  severity: Severity;
  quote: string;
  turnIndex: number;
  startMs: number;
  confidence: number;
  status: FindingStatus;
  engine: Engine;
  rationale: string;
  createdAt: string;
  reviewerNote?: string;
}

export interface GateCheck {
  ruleId: string;
  code: string;
  ok: boolean;
  message: string;
  detail?: string;
}

export interface GateResult {
  decision: "allow" | "deny" | "reschedule";
  checks: GateCheck[];
  evaluatedAt: string;
  nextWindow: string | null;
}

export interface RawFinding {
  ruleCode: string;
  severity: Severity;
  quote: string;
  turnIndex: number;
  confidence: number;
  rationale: string;
}

export interface ChainEntry {
  callId: string;
  transcriptHash: string;
  findingsHash: string;
  prevHash: string;
  hash: string;
}

export interface Report {
  id: string;
  campaignId: string;
  periodStart: string;
  periodEnd: string;
  generatedAt: string;
  callCount: number;
  findingCount: number;
  openCount: number;
  criticalCount: number;
  chain: ChainEntry[];
  reportHash: string;
  signedBy: string | null;
  signedAt: string | null;
  engine: string;
  policyVersion: string;
}

export interface AuditEvent {
  id: string;
  at: string;
  type: "gate" | "ingest" | "audit" | "breaker" | "review" | "report";
  message: string;
  callId?: string;
  campaignId?: string;
}

export interface Settings {
  judgeMode: Engine;
}

export interface DB {
  policy: Policy;
  rules: PolicyRule[];
  contacts: Contact[];
  campaigns: Campaign[];
  calls: CallRecord[];
  findings: Finding[];
  reports: Report[];
  events: AuditEvent[];
  settings: Settings;
}

export interface CalibrationLabel {
  callId: string;
  expected: string[];
  note: string;
}

export interface GateLabel {
  contactId: string;
  campaignId: string;
  expected: "allow" | "deny" | "reschedule";
}

export interface RuleScore {
  code: string;
  title: string;
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  expected: number;
  precision: number | null;
  recall: number | null;
}

export interface CalibrationResult {
  perRule: RuleScore[];
  overall: {
    precision: number | null;
    recall: number | null;
    truePositives: number;
    falsePositives: number;
    falseNegatives: number;
  };
  gate: {
    correct: number;
    total: number;
    accuracy: number;
  };
}
