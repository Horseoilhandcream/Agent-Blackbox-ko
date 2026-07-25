import { hasAbbCodexHooks, mergeAbbCodexHooks, removeAbbCodexHooks, type CodexHooksConfig } from "@agent-blackbox/codex-adapter";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { writeFileAtomic } from "./atomicWrite.js";

export function globalCodexDir(): string {
  const override = process.env.CODEX_HOME;
  return override && override.length > 0 ? override : join(homedir(), ".codex");
}

export function codexHooksPath(): string {
  return join(globalCodexDir(), "hooks.json");
}

export async function installCodexHooks(options: { hookEntryPath: string }): Promise<{ hooksPath: string }> {
  const hooksPath = codexHooksPath();
  const config = await readConfig(hooksPath);
  const invocation = `node ${JSON.stringify(options.hookEntryPath)}`;
  const next = mergeAbbCodexHooks(config, invocation);
  // Atomic: hooks.json is the user's own global Codex config (see initClaudeHooks).
  await writeFileAtomic(hooksPath, `${JSON.stringify(next, null, 2)}\n`);
  return { hooksPath };
}

export async function uninstallCodexHooks(): Promise<{ hooksPath: string; removed: boolean }> {
  const hooksPath = codexHooksPath();
  let config: CodexHooksConfig;
  try {
    config = JSON.parse(await readFile(hooksPath, "utf8")) as CodexHooksConfig;
  } catch (error) {
    if (isNotFound(error)) return { hooksPath, removed: false };
    throw error;
  }
  if (!hasAbbCodexHooks(config)) return { hooksPath, removed: false };
  await writeFileAtomic(hooksPath, `${JSON.stringify(removeAbbCodexHooks(config), null, 2)}\n`);
  return { hooksPath, removed: true };
}

async function readConfig(path: string): Promise<CodexHooksConfig> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as CodexHooksConfig;
  } catch (error) {
    if (isNotFound(error)) return {};
    throw new Error(`Refusing to edit ${path}: it isn't valid JSON (${error instanceof Error ? error.message : String(error)}).`);
  }
}

function isNotFound(error: unknown): boolean {
  return error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT";
}
