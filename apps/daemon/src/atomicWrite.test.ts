import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { writeFileAtomic } from "./atomicWrite.js";

let tempDir: string | undefined;

afterEach(async () => {
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  }
});

describe("writeFileAtomic", () => {
  it("creates missing parent directories and leaves no temp file behind", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "abb-atomic-"));
    const target = join(tempDir, "nested", "deeper", "settings.json");

    await writeFileAtomic(target, '{"a":1}\n');

    expect(await readFile(target, "utf8")).toBe('{"a":1}\n');
    expect(await readdir(join(tempDir, "nested", "deeper"))).toEqual(["settings.json"]);
  });

  it("replaces existing content without stranding a temp sibling", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "abb-atomic-"));
    const target = join(tempDir, "hooks.json");
    await writeFile(target, "old", "utf8");

    await writeFileAtomic(target, "new");

    expect(await readFile(target, "utf8")).toBe("new");
    expect(await readdir(tempDir)).toEqual(["hooks.json"]);
  });

  it("leaves the original intact when the write fails", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "abb-atomic-"));
    const target = join(tempDir, "settings.json");
    await writeFile(target, "precious", "utf8");
    // A directory where the temp file wants to be: open(tmp, "w") fails with EISDIR,
    // standing in for the ENOSPC/kill cases we actually care about.
    await mkdir(`${target}.${process.pid}.tmp`, { recursive: true });

    await expect(writeFileAtomic(target, "clobbered")).rejects.toThrow();
    expect(await readFile(target, "utf8")).toBe("precious");
  });
});
