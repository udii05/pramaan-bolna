import { describe, expect, it } from "vitest";
import { normalizeBolnaExecution } from "./bolna";

describe("normalizeBolnaExecution", () => {
  it("normalises an array transcript with second timestamps", () => {
    const result = normalizeBolnaExecution({
      id: "exec-1",
      status: "completed",
      conversation_duration: 8,
      user_data: { campaign_id: "camp-1", contact_id: "c-1" },
      transcript: [
        { role: "assistant", content: "Namaste.", start_time: 0, end_time: 2 },
        { role: "user", content: "Haan.", start_time: 2, end_time: 4 },
      ],
    });

    expect(result.executionId).toBe("exec-1");
    expect(result.turns).toHaveLength(2);
    expect(result.turns[1].role).toBe("user");
    expect(result.turns[1].startMs).toBe(2000);
    expect(result.campaignId).toBe("camp-1");
    expect(result.contactId).toBe("c-1");
    expect(result.durationMs).toBe(8000);
  });

  it("parses a transcript string and keeps role labels", () => {
    const result = normalizeBolnaExecution({
      execution_id: "exec-2",
      status: "completed",
      transcript: "assistant: Namaste, main AI hoon.\nuser: Haan boliye.\nassistant: Theek hai.",
    });

    expect(result.executionId).toBe("exec-2");
    expect(result.turns).toHaveLength(3);
    expect(result.turns[0].role).toBe("agent");
    expect(result.turns[1].role).toBe("user");
    expect(result.turns[2].startMs).toBeGreaterThan(0);
  });

  it("parses user_data supplied as a JSON string", () => {
    const result = normalizeBolnaExecution({
      id: "exec-3",
      user_data: JSON.stringify({ campaign_id: "camp-9", contact_id: "c-9" }),
    });
    expect(result.campaignId).toBe("camp-9");
    expect(result.contactId).toBe("c-9");
  });

  it("maps a no-answer execution without inventing a transcript", () => {
    const result = normalizeBolnaExecution({ id: "exec-4", status: "no-answer" });
    expect(result.status).toBe("no_answer");
    expect(result.turns).toHaveLength(0);
  });
});
