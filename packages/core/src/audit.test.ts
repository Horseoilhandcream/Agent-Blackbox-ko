import { describe, expect, it } from "vitest";
import { createTraceEvent } from "./events.js";
import { materializeWorkflowGraph } from "./graph.js";
import { evaluatePromiseChecks, generateHandoffMarkdown } from "./audit.js";

let seq = 0;
const ev = (kind: Parameters<typeof createTraceEvent>[1]["kind"], payload: Record<string, unknown>) =>
  createTraceEvent((seq += 1), { host: "opencode", runId: "run-handoff", sessionId: "s", kind, payload: payload as never });

describe("promise checks", () => {
  it("verifies model test claims against observed bash events", () => {
    const events = [
      createTraceEvent(1, {
        host: "opencode",
        runId: "run-audit",
        sessionId: "session-audit",
        kind: "message",
        payload: { role: "assistant", text: "I ran the tests and updated the implementation." }
      }),
      createTraceEvent(2, {
        host: "opencode",
        runId: "run-audit",
        sessionId: "session-audit",
        kind: "bash",
        payload: { command: "npm test", exitCode: 0 }
      }),
      createTraceEvent(3, {
        host: "opencode",
        runId: "run-audit",
        sessionId: "session-audit",
        kind: "file_edit",
        payload: { path: "src/index.ts" }
      })
    ];

    expect(evaluatePromiseChecks(events).map((check) => check.status)).toEqual(["verified", "verified"]);
  });

  it("flags unsupported model claims", () => {
    const events = [
      createTraceEvent(1, {
        host: "opencode",
        runId: "run-audit",
        sessionId: "session-audit",
        kind: "message",
        payload: { role: "assistant", text: "I ran the tests." }
      })
    ];

    expect(evaluatePromiseChecks(events)).toEqual([
      {
        claim: "tests-run: I ran the tests.",
        status: "unverified",
        evidenceEventIds: [],
        severity: "warning"
      }
    ]);
  });
});

describe("handoff markdown", () => {
  it("summarizes graph state and promise checks", () => {
    const events = [
      createTraceEvent(1, {
        host: "opencode",
        runId: "run-handoff",
        sessionId: "session-handoff",
        kind: "file_read",
        payload: { path: "src/index.ts" }
      }),
      createTraceEvent(2, {
        host: "opencode",
        runId: "run-handoff",
        sessionId: "session-handoff",
        kind: "bash",
        payload: { command: "npm test", exitCode: 1 }
      })
    ];
    const markdown = generateHandoffMarkdown(materializeWorkflowGraph(events), [
      {
        claim: "tests-run: I ran the tests.",
        status: "verified",
        evidenceEventIds: ["evt_run-handoff_000002"],
        severity: "info"
      }
    ]);

    expect(markdown).toContain("## Files In Play");
    expect(markdown).toContain("src/index.ts");
    expect(markdown).toContain("VERIFIED");
    expect(markdown).toContain("Inspect the latest failed command");
  });

  it("names the objective the user actually gave, and omits sections it cannot fill", () => {
    // A run where nothing failed and nothing was blocked. The old template printed
    // "## Decisions\n- None recorded." for kinds no adapter emits, which reads as
    // "nothing was decided" rather than "never measured".
    const events = [
      ev("message", { properties: { role: "user", text: "Add a modulo operation end to end" } }),
      ev("file_read", { path: "src/calc.ts" }),
      ev("file_edit", { path: "src/calc.ts" }),
      ev("bash", { command: "npm test", exitCode: 0 })
    ];
    const markdown = generateHandoffMarkdown(materializeWorkflowGraph(events), [], events);

    expect(markdown).toContain("Add a modulo operation end to end");
    expect(markdown).not.toContain("run-handoff"); // not a bare run id
    expect(markdown).not.toContain("None recorded");
    expect(markdown).not.toContain("## Decisions");
    expect(markdown).not.toContain("## Failed Attempts");
    expect(markdown).toContain("src/calc.ts [changed]"); // edited beats merely read
  });

  it("stays small on a long run and carries no internal event ids", () => {
    const events = [
      ev("message", { properties: { role: "user", text: "Survey the repository" } }),
      ...Array.from({ length: 120 }, (_, i) => ev("file_read", { path: `src/mod-${i}.ts` }))
    ];
    const markdown = generateHandoffMarkdown(materializeWorkflowGraph(events), [], events);

    expect(markdown).not.toMatch(/evt_/); // unresolvable outside this tool
    expect(markdown.length).toBeLessThan(1500); // was ~16k on a real 661-event run
    expect(markdown).toContain("and 108 more"); // 120 files, 12 shown
  });

  it("falls back honestly when no prompt was recorded", () => {
    const markdown = generateHandoffMarkdown(materializeWorkflowGraph([ev("file_read", { path: "a.ts" })]), [], []);
    expect(markdown).toContain("Not captured in the recorded events");
  });
});
