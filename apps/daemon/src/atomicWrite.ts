import { open, mkdir, rename, rm } from "node:fs/promises";
import { dirname } from "node:path";

/**
 * Crash-safe file write: render into a sibling temp file, flush it, then rename
 * over the target. `rename(2)` is atomic within a filesystem, so a reader only
 * ever sees the old bytes or the new ones — never a half-written file — and a
 * kill / power loss / ENOSPC mid-write leaves the ORIGINAL intact.
 *
 * That matters most for the files ABB does not own: the user's global
 * ~/.claude/settings.json and ~/.codex/hooks.json, the OpenCode plugin, and the
 * AGENTS.md/CLAUDE.md that holds their own notes above our managed block. A plain
 * writeFile truncates first, so an interrupted install would leave the user's
 * agent config empty — breaking their tooling, not just ours.
 */
export async function writeFileAtomic(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  try {
    const handle = await open(tmp, "w");
    try {
      await handle.writeFile(content, "utf8");
      // Durability on top of atomicity: without the flush, a power loss right
      // after the rename can surface a zero-length file on some filesystems.
      // Best-effort — a filesystem that rejects fsync still gets the atomic swap.
      await handle.sync().catch(() => undefined);
    } finally {
      await handle.close();
    }
    await rename(tmp, path);
  } catch (error) {
    // Never leave a stray .tmp behind next to the user's config.
    await rm(tmp, { force: true }).catch(() => undefined);
    throw error;
  }
}
