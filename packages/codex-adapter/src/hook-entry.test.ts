import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { codexHookStateDir, runCodexHook } from "./hook-entry.js";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

describe("Codex optimizer hook runtime", () => {
  it("denies only an unchanged full-file reread and resets after compaction", async () => {
    const root = await mkdtemp(join(tmpdir(), "abb-codex-hook-"));
    cleanups.push(() => rm(root, { recursive: true, force: true }));
    const before = process.env.TMPDIR;
    process.env.TMPDIR = root;
    cleanups.push(async () => {
      if (before === undefined) delete process.env.TMPDIR;
      else process.env.TMPDIR = before;
    });

    await writeFile(join(root, "input.txt"), "hook-check\n", "utf8");
    const input = {
      session_id: "hook-runtime-test",
      cwd: root,
      tool_name: "Bash",
      tool_input: { command: "cat input.txt" }
    };

    runCodexHook("SessionStart", input);
    expect(runCodexHook("PreToolUse", input)).toBeUndefined();
    runCodexHook("PostToolUse", input);
    expect(runCodexHook("PreToolUse", input)).toMatchObject({
      hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny" }
    });
    expect(runCodexHook("UserPromptSubmit", input)).toMatchObject({
      hookSpecificOutput: { hookEventName: "UserPromptSubmit" }
    });
    runCodexHook("PreCompact", input);
    expect(runCodexHook("PreToolUse", input)).toBeUndefined();
  });

  // Every hook invocation is a NEW process, so the state directory has to be scoped
  // to something stable per USER. A per-process scope (a pid) would hand each
  // invocation its own empty state and silently disable read-dedup and the working
  // set — and it would only show up on Windows, which has no getuid().
  it("scopes hook state per user, never per process", () => {
    const dir = codexHookStateDir();
    expect(dir).toBe(codexHookStateDir());
    expect(dir).not.toContain(String(process.pid));

    const realGetuid = process.getuid;
    try {
      // Simulate Windows, where process.getuid is absent.
      delete (process as { getuid?: unknown }).getuid;
      const windowsDir = codexHookStateDir();
      expect(windowsDir).toBe(codexHookStateDir());
      expect(windowsDir).not.toContain(String(process.pid));
    } finally {
      if (realGetuid) (process as { getuid?: unknown }).getuid = realGetuid;
    }
  });
});
