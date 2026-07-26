import { describe, expect, it } from "vitest";

import { evaluatePromiseChecks } from "./audit.js";
import { computeEffectiveness } from "./effectiveness.js";
import { computeEfficiencyReport } from "./efficiency.js";
import { createTraceEvent, validateTraceEvent } from "./events.js";
import { materializeWorkflowGraph, replayWorkflowGraphAtSeq } from "./graph.js";
import { redactJsonValue } from "./redaction.js";
import { evaluateRulePack, parseRulePack } from "./rulePack.js";
import { classifyRun } from "./taskProfile.js";
import { buildCausalTimeline } from "./timeline.js";

// Everything here runs on input the daemon takes from outside itself: events POSTed
// over HTTP, a rules.json that rides in with a cloned repo, and tool output captured
// verbatim from a run. None of it may throw, hang, or produce a nonsense number — the
// daemon is long-lived and the dashboard re-runs these on its render thread.

const ev = (seq: number, kind: Parameters<typeof createTraceEvent>[1]["kind"], payload: Record<string, unknown>) =>
  createTraceEvent(seq, { host: "opencode", runId: "r", sessionId: "s", kind, payload: payload as never });

const HOSTILE_STRINGS = [
  "",
  "𝕏".repeat(1000),
  "한글".repeat(5000),
  "-".repeat(50_000),
  "a".repeat(200_000),
  "-----BEGIN RSA PRIVATE KEY-----".repeat(300), // unterminated markers: backtracking bait
  `api_key=${"x".repeat(50_000)}`,
  `Bearer ${"A".repeat(100_000)}`,
  `${"../".repeat(5000)}etc/passwd`,
  `sk-${"A".repeat(100_000)}`
];

describe("hostile input", () => {
  it("redacts pathological strings without hanging", () => {
    const started = Date.now();
    for (const value of HOSTILE_STRINGS) {
      const result = redactJsonValue(value, { homeDir: "/Users/x", projectDir: "/p", maxStringLength: 4000 });
      expect(typeof result.value).toBe("string");
    }
    expect(Date.now() - started).toBeLessThan(3000);
  });

  it("rejects malformed events instead of throwing, and resists prototype pollution", () => {
    const malformed: unknown[] = [
      null,
      undefined,
      0,
      "",
      [],
      {},
      { id: 1 },
      { id: "e", ts: "nope", seq: 1.5, host: "opencode", runId: "r", sessionId: "s", kind: "message", sensitivity: "private", payload: {}, redaction: {}, evidence: {} },
      { id: "e", ts: "2026-01-01T00:00:00Z", seq: -3, host: "not-a-host", runId: "r", sessionId: "s", kind: "message", sensitivity: "private", payload: {}, redaction: {}, evidence: {} },
      { id: "e", ts: "2026-01-01T00:00:00Z", seq: 1, host: "opencode", runId: "r", sessionId: "s", kind: "message", sensitivity: "private", payload: null, redaction: {}, evidence: {} }
    ];
    for (const value of malformed) {
      expect(validateTraceEvent(value).ok).toBe(false);
    }

    const polluting = JSON.parse(
      '{"__proto__":{"polluted":true},"id":"e","ts":"2026-01-01T00:00:00Z","seq":1,"host":"opencode","runId":"r","sessionId":"s","kind":"message","sensitivity":"private","payload":{},"redaction":{},"evidence":{}}'
    ) as unknown;
    expect(validateTraceEvent(polluting).ok).toBe(true); // a legal event…
    expect(({} as Record<string, unknown>).polluted).toBeUndefined(); // …that pollutes nothing
  });

  it("compiles or skips untrusted rule patterns without catastrophic backtracking", () => {
    const events = [
      ev(1, "file_read", { path: `${"a".repeat(100_000)}.ts`, chars: 5 }),
      ev(2, "bash", { command: "a".repeat(100_000), exitCode: 0, outputChars: 1 }),
      ev(3, "git_commit", { command: "git commit" })
    ];
    const packs: unknown[] = [
      { rules: [{ id: "a", type: "forbid-read", pattern: "(a+)+$" }] },
      { rules: [{ id: "b", type: "forbid-bash", pattern: "(x|x)*y" }] },
      { rules: [{ id: "c", type: "max-reads", pattern: ".*".repeat(60), limit: 1 }] },
      { rules: [{ id: "d", type: "require-before-commit", pattern: "(.*,)*" }] },
      { rules: [{ id: "e", type: "forbid-read", pattern: "a{100000}" }] },
      { rules: Array.from({ length: 500 }, (_, i) => ({ id: `r${i}`, type: "forbid-read", pattern: ".*" })) },
      { rules: "nope" },
      null,
      42
    ];
    const started = Date.now();
    for (const pack of packs) {
      expect(() => evaluateRulePack(events, parseRulePack(pack))).not.toThrow();
    }
    expect(Date.now() - started).toBeLessThan(3000);
    // The 500-rule pack is capped, so one repo's config can't dominate a build.
    expect(parseRulePack(packs[5]).rules.length).toBeLessThanOrEqual(50);
  });

  it("keeps every analysis finite and in range on degenerate event sets", () => {
    const sets: Record<string, ReturnType<typeof ev>[]> = {
      empty: [],
      single: [ev(1, "message", { role: "user", text: "hi" })],
      noPayload: [ev(1, "file_read", {}), ev(2, "file_edit", {}), ev(3, "bash", {})],
      negatives: [ev(1, "file_read", { path: "/a", chars: -5 }), ev(2, "bash", { outputChars: Number.NaN, exitCode: -1 })],
      infinities: [ev(1, "file_read", { path: "/a", chars: Number.POSITIVE_INFINITY })],
      duplicateSeq: [ev(1, "file_read", { path: "/a", chars: 10 }), ev(1, "file_edit", { path: "/a", chars: 10 })]
    };

    for (const [name, events] of Object.entries(sets)) {
      const report = computeEfficiencyReport(events);
      expect(report.overallScore, name).toBeGreaterThanOrEqual(0);
      expect(report.overallScore, name).toBeLessThanOrEqual(100);
      expect(Number.isFinite(report.reclaimableTokens), name).toBe(true);
      expect(report.reclaimableTokens, name).toBeGreaterThanOrEqual(0);
      for (const metric of report.metrics) {
        expect(Number.isFinite(metric.score), `${name}:${metric.id}`).toBe(true);
        expect(metric.display, `${name}:${metric.id}`).not.toContain("NaN");
      }
      expect(() => materializeWorkflowGraph(events), name).not.toThrow();
      expect(() => replayWorkflowGraphAtSeq(events, 5), name).not.toThrow();
      expect(() => buildCausalTimeline(events), name).not.toThrow();
      expect(() => classifyRun(events), name).not.toThrow();
      expect(() => computeEffectiveness(events, evaluatePromiseChecks(events)), name).not.toThrow();
    }
  });
});
