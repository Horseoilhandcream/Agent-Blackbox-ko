import { createHash } from "node:crypto";
export const hashContent = (content) => createHash("sha1").update(content).digest("hex").slice(0, 12);
const READ_TOOLS = new Set(["read", "view", "cat", "readfile", "read_file"]);
export const isReadTool = (tool) => typeof tool === "string" && READ_TOOLS.has(tool.toLowerCase());
// Pull the file path out of a read tool's args, tolerating naming variants.
export function readArgPath(args) {
    if (!args || typeof args !== "object")
        return undefined;
    const a = args;
    for (const key of ["filePath", "path", "file", "filename", "target"]) {
        const v = a[key];
        if (typeof v === "string" && v.length > 0)
            return v;
    }
    return undefined;
}
const baseName = (path) => path.split(/[\\/]/).filter(Boolean).pop() ?? path;
// A localized edit changes a contiguous middle; the identical prefix/suffix are
// provably still in the agent's earlier copy, so we send only the changed slice.
export function computeReadDelta(prior, current, path) {
    const a = prior.split("\n");
    const b = current.split("\n");
    let p = 0;
    while (p < a.length && p < b.length && a[p] === b[p])
        p += 1;
    let s = 0;
    while (s < a.length - p && s < b.length - p && a[a.length - 1 - s] === b[b.length - 1 - s])
        s += 1;
    const changed = b.slice(p, b.length - s);
    if (changed.length === 0)
        return null;
    const from = p + 1;
    const to = b.length - s;
    return (`⟨Agent-Blackbox: ${baseName(path)} changed since your last read — showing only lines ${from}–${to}; ` +
        `the ${p} leading and ${s} trailing lines are unchanged from your earlier copy.⟩\n` +
        changed.join("\n"));
}
export function decideReadServe(prior, current, gen, path) {
    // First read, or a compaction happened since we last served it → serve full.
    if (!prior || prior.gen !== gen)
        return { mode: "full", saved: 0 };
    if (prior.hash === current.hash) {
        const lines = current.content.split("\n").length;
        const note = `⟨Agent-Blackbox: identical to your earlier read of ${baseName(path)} ` +
            `(${lines} lines, unchanged) — reuse that copy instead of re-reading.⟩`;
        return { mode: "noop", output: note, saved: Math.max(0, current.content.length - note.length) };
    }
    const diff = computeReadDelta(prior.content, current.content, path);
    if (diff && diff.length < current.content.length * 0.8) {
        return { mode: "diff", output: diff, saved: current.content.length - diff.length };
    }
    return { mode: "full", saved: 0 };
}
// The actuator's state lives inside the user's OpenCode process for as long as the
// session does, and the read cache holds WHOLE FILE CONTENTS. Unbounded, a long
// session that touches many (or large) files would grow that process's heap until
// it dies — an observability add-on must never do that. Everything here is capped;
// evicting only ever costs a missed dedup, and the next read is served in full.
export const READ_CACHE_MAX_ENTRIES = 64;
export const READ_CACHE_MAX_CONTENT_BYTES = 512 * 1024;
export const WORKING_SET_MAX_FILES = 200;
export const WORKING_SET_MAX_COMMANDS = 20;
/**
 * Record the bytes last served for a read, keeping the cache bounded. A Map
 * iterates in insertion order, so deleting before setting makes the oldest key the
 * least-recently-served one — a plain LRU. Contents past
 * READ_CACHE_MAX_CONTENT_BYTES aren't cached at all: one huge file could otherwise
 * outweigh the whole rest of the budget.
 */
export function rememberRead(cache, key, entry) {
    cache.delete(key);
    if (entry.content.length > READ_CACHE_MAX_CONTENT_BYTES)
        return;
    cache.set(key, entry);
    while (cache.size > READ_CACHE_MAX_ENTRIES) {
        const oldest = cache.keys().next();
        if (oldest.done)
            break;
        cache.delete(oldest.value);
    }
}
/** Drop the least-touched file once the working set is full, so it stays bounded. */
export function evictColdestFile(files) {
    if (files.size <= WORKING_SET_MAX_FILES)
        return;
    let coldestPath;
    let coldestTouches = Number.POSITIVE_INFINITY;
    for (const [path, file] of files) {
        const touches = file.reads + file.edits;
        if (touches < coldestTouches) {
            coldestTouches = touches;
            coldestPath = path;
        }
    }
    if (coldestPath !== undefined)
        files.delete(coldestPath);
}
export const WORKING_SET_START = "⟨agent-blackbox:working-set⟩";
export const WORKING_SET_END = "⟨/agent-blackbox:working-set⟩";
// Compact recall layer injected into the system prompt (kept tiny — every line is
// context the run must carry). Returns null when there's nothing worth pinning.
export function buildWorkingSetBlock(files, commands) {
    const hot = [...files].sort((x, y) => y.reads + y.edits - (x.reads + x.edits)).slice(0, 8);
    const cmds = [...new Set(commands)].slice(0, 4);
    if (hot.length === 0 && cmds.length === 0)
        return null;
    const lines = [];
    if (hot.length > 0) {
        lines.push("Files already in play (read once and reuse — don't re-read whole files):");
        for (const f of hot) {
            const touches = [f.reads ? `read ${f.reads}×` : "", f.edits ? `edited ${f.edits}×` : ""].filter(Boolean).join(", ");
            lines.push(`- ${f.path}${touches ? ` (${touches})` : ""}`);
        }
    }
    if (cmds.length > 0) {
        lines.push("Verified commands (reuse, don't rediscover):");
        for (const c of cmds)
            lines.push(`- ${c}`);
    }
    return [WORKING_SET_START, "Agent-Blackbox working set — what this run has already established:", ...lines, WORKING_SET_END].join("\n");
}
// Read-only navigation verbs aren't worth pinning as "verified commands".
const NAV_VERBS = new Set([
    "ls", "pwd", "cat", "find", "grep", "rg", "fd", "head", "tail", "echo", "which",
    "env", "cd", "tree", "stat", "wc", "sort", "uniq", "clear", "sleep", "true", "false"
]);
export const isReusableCommand = (command) => {
    const verb = command.trim().split(/\s+/)[0] ?? "";
    return verb.length > 0 && !NAV_VERBS.has(verb);
};
//# sourceMappingURL=optimize.js.map