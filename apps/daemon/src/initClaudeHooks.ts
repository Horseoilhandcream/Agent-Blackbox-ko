import { hasAbbHooks, mergeAbbHooks, removeAbbHooks, type Settings } from "@agent-blackbox/claude-code-adapter";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { writeFileAtomic } from "./atomicWrite.js";

// Claude Code's global config dir (respects CLAUDE_CONFIG_DIR), where settings.json
// — and thus the hooks that fire for every session — lives.
export function globalClaudeDir(): string {
  const override = process.env.CLAUDE_CONFIG_DIR;
  return override && override.length > 0 ? override : join(homedir(), ".claude");
}

export function claudeSettingsPath(): string {
  return join(globalClaudeDir(), "settings.json");
}

/**
 * Install ABB's in-run actuator hooks into Claude Code's global settings.json,
 * preserving every other setting and the user's own hooks. Idempotent (re-stamps
 * the invocation). `hookEntryPath` is the absolute path to the built hook entry.
 */
export async function installClaudeCodeHooks(options: { hookEntryPath: string }): Promise<{ settingsPath: string }> {
  const settingsPath = claudeSettingsPath();
  const settings = await readSettings(settingsPath);
  const next = mergeAbbHooks(settings, `node ${options.hookEntryPath}`);
  // Atomic: settings.json is the user's own global Claude Code config. An
  // interrupted truncate-and-write would leave it empty and break every session.
  await writeFileAtomic(settingsPath, `${JSON.stringify(next, null, 2)}\n`);
  return { settingsPath };
}

export async function uninstallClaudeCodeHooks(): Promise<{ settingsPath: string; removed: boolean }> {
  const settingsPath = claudeSettingsPath();
  let settings: Settings;
  try {
    settings = JSON.parse(await readFile(settingsPath, "utf8")) as Settings;
  } catch (error) {
    if (isNotFound(error)) return { settingsPath, removed: false };
    throw error;
  }
  if (!hasAbbHooks(settings)) return { settingsPath, removed: false };
  await writeFileAtomic(settingsPath, `${JSON.stringify(removeAbbHooks(settings), null, 2)}\n`);
  return { settingsPath, removed: true };
}

// A missing settings.json is fine (we create it). A *malformed* one is not — we must
// not clobber the user's file, so surface the parse error instead of overwriting.
async function readSettings(path: string): Promise<Settings> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as Settings;
  } catch (error) {
    if (isNotFound(error)) return {};
    throw new Error(`Refusing to edit ${path}: it isn't valid JSON (${error instanceof Error ? error.message : String(error)}).`);
  }
}

function isNotFound(error: unknown): boolean {
  return error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT";
}
