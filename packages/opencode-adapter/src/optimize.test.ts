import { describe, expect, it } from "vitest";

import {
  buildWorkingSetBlock,
  computeReadDelta,
  decideReadServe,
  evictColdestFile,
  hashContent,
  isReadTool,
  isReusableCommand,
  READ_CACHE_MAX_CONTENT_BYTES,
  READ_CACHE_MAX_ENTRIES,
  readArgPath,
  rememberRead,
  WORKING_SET_END,
  WORKING_SET_MAX_FILES,
  WORKING_SET_START,
  type ReadCacheEntry,
  type WorkingSetFile
} from "./optimize.js";

const entry = (content: string, gen: number) => ({ hash: hashContent(content), content, gen });

describe("in-run optimizer", () => {
  it("serves the full file on first read", () => {
    const cur = "line1\nline2\n";
    const d = decideReadServe(undefined, { hash: hashContent(cur), content: cur }, 0, "a.ts");
    expect(d.mode).toBe("full");
  });

  it("serves a no-op when an unchanged file is re-read with no compaction since", () => {
    const cur = "a\nb\nc\n".repeat(50);
    const prior = entry(cur, 0);
    const d = decideReadServe(prior, { hash: hashContent(cur), content: cur }, 0, "big.ts");
    expect(d.mode).toBe("noop");
    expect(d.output).toMatch(/unchanged/i);
    expect(d.saved).toBeGreaterThan(0); // the note is far smaller than the file
  });

  it("serves the full file again after a compaction (the agent may have lost it)", () => {
    const cur = "a\nb\nc\n".repeat(50);
    const prior = entry(cur, 0);
    // gen advanced → compaction happened since we last served it
    const d = decideReadServe(prior, { hash: hashContent(cur), content: cur }, 1, "big.ts");
    expect(d.mode).toBe("full");
  });

  it("serves only the changed slice when an edited file is re-read", () => {
    const prior = Array.from({ length: 60 }, (_, i) => `line ${i}`).join("\n");
    const current = prior.replace("line 30", "line 30 // edited");
    const d = decideReadServe(entry(prior, 0), { hash: hashContent(current), content: current }, 0, "src/x.ts");
    expect(d.mode).toBe("diff");
    expect(d.output).toContain("line 30 // edited");
    expect(d.output).not.toContain("line 5"); // unchanged lines are omitted
    expect((d.output ?? "").length).toBeLessThan(current.length);
  });

  it("computeReadDelta returns null when content is identical", () => {
    expect(computeReadDelta("x\ny", "x\ny", "a.ts")).toBeNull();
  });

  it("builds a working-set block from hot files and reusable commands", () => {
    const block = buildWorkingSetBlock(
      [
        { path: "src/calc.ts", reads: 3, edits: 1 },
        { path: "src/util.ts", reads: 1, edits: 0 }
      ],
      ["node test.js", "node test.js"]
    );
    expect(block).toContain(WORKING_SET_START);
    expect(block).toContain(WORKING_SET_END);
    expect(block).toContain("src/calc.ts");
    expect(block).toContain("node test.js");
    expect(buildWorkingSetBlock([], [])).toBeNull();
  });

  it("recognizes read tools, command paths, and reusable vs navigation commands", () => {
    expect(isReadTool("read")).toBe(true);
    expect(isReadTool("bash")).toBe(false);
    expect(readArgPath({ filePath: "a.ts" })).toBe("a.ts");
    expect(readArgPath({ path: "b.ts" })).toBe("b.ts");
    expect(isReusableCommand("node test.js")).toBe(true);
    expect(isReusableCommand("ls -la")).toBe(false);
  });
});

// The recorder runs inside the user's long-lived OpenCode process, so these caches
// must not grow with the session — see the bounds in optimize.ts.
describe("bounded actuator state", () => {
  it("evicts the least-recently-served read once the cache is full", () => {
    const cache = new Map<string, ReadCacheEntry>();
    for (let i = 0; i < READ_CACHE_MAX_ENTRIES + 10; i += 1) {
      rememberRead(cache, `k${i}`, entry(`body ${i}`, 0));
    }
    expect(cache.size).toBe(READ_CACHE_MAX_ENTRIES);
    expect(cache.has("k0")).toBe(false); // oldest dropped
    expect(cache.has(`k${READ_CACHE_MAX_ENTRIES + 9}`)).toBe(true); // newest kept
  });

  it("re-serving a key refreshes its recency instead of duplicating it", () => {
    const cache = new Map<string, ReadCacheEntry>();
    rememberRead(cache, "hot", entry("v1", 0));
    for (let i = 0; i < READ_CACHE_MAX_ENTRIES - 1; i += 1) rememberRead(cache, `k${i}`, entry(`b${i}`, 0));
    rememberRead(cache, "hot", entry("v2", 0)); // touched again → newest
    rememberRead(cache, "overflow", entry("b", 0));

    expect(cache.size).toBe(READ_CACHE_MAX_ENTRIES);
    expect(cache.get("hot")?.content).toBe("v2");
    expect(cache.has("k0")).toBe(false); // the cold one went instead
  });

  it("never caches a file larger than the per-entry ceiling", () => {
    const cache = new Map<string, ReadCacheEntry>();
    const huge = "x".repeat(READ_CACHE_MAX_CONTENT_BYTES + 1);
    rememberRead(cache, "huge.bin", entry(huge, 0));
    expect(cache.size).toBe(0);
  });

  it("drops a previously cached entry when its file grows past the ceiling", () => {
    const cache = new Map<string, ReadCacheEntry>();
    rememberRead(cache, "grows.log", entry("small", 0));
    rememberRead(cache, "grows.log", entry("x".repeat(READ_CACHE_MAX_CONTENT_BYTES + 1), 0));
    expect(cache.has("grows.log")).toBe(false); // stale bytes must not linger
  });

  it("caps the working set by dropping the least-touched file", () => {
    const files = new Map<string, WorkingSetFile>();
    files.set("hot.ts", { path: "hot.ts", reads: 9, edits: 3 });
    for (let i = 0; i < WORKING_SET_MAX_FILES; i += 1) {
      files.set(`f${i}.ts`, { path: `f${i}.ts`, reads: 2, edits: 0 });
      evictColdestFile(files);
    }
    expect(files.size).toBe(WORKING_SET_MAX_FILES);
    expect(files.has("hot.ts")).toBe(true);
  });
});
