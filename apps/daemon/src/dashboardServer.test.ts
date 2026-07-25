import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { startDashboardServer, type RunningDashboardServer } from "./dashboardServer.js";

let tempDir: string | undefined;
let server: RunningDashboardServer | undefined;

afterEach(async () => {
  if (server) {
    await server.close();
    server = undefined;
  }
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  }
});

async function serve(): Promise<{ base: string; root: string }> {
  tempDir = await mkdtemp(join(tmpdir(), "abb-dash-"));
  const root = join(tempDir, "dist");
  await mkdir(root, { recursive: true });
  await writeFile(join(root, "index.html"), "<html><head></head><body>app</body></html>", "utf8");
  await writeFile(join(root, "app.js"), "console.log('app')", "utf8");
  // A sibling that merely shares the dist prefix — the shape a bare startsWith
  // containment check would wave through.
  await mkdir(join(tempDir, "dist-secrets"), { recursive: true });
  await writeFile(join(tempDir, "dist-secrets", "token.txt"), "SECRET", "utf8");
  await writeFile(join(tempDir, "outside.txt"), "SECRET", "utf8");
  server = await startDashboardServer({ distDir: root, port: 0, daemonUrl: "http://127.0.0.1:47831" });
  return { base: `http://127.0.0.1:${server.port}`, root };
}

describe("dashboard static server", () => {
  it("serves the shell with the daemon URL injected", async () => {
    const { base } = await serve();
    const body = await (await fetch(`${base}/`)).text();
    expect(body).toContain("AGENT_BLACKBOX_DAEMON_URL");
    expect(body).toContain("http://127.0.0.1:47831");
  });

  it("serves assets under the dist root", async () => {
    const { base } = await serve();
    const response = await fetch(`${base}/app.js`);
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("console.log");
  });

  it("never serves a file outside the dist root", async () => {
    const { base } = await serve();
    for (const path of [
      "/../outside.txt",
      "/../../etc/passwd",
      "/..%2Foutside.txt",
      "/%2e%2e%2foutside.txt",
      "/../dist-secrets/token.txt"
    ]) {
      const response = await fetch(`${base}${path}`);
      const body = await response.text();
      expect(body).not.toContain("SECRET");
      // Unknown paths fall back to the SPA shell; what matters is the leak, not the code.
      expect([200, 403, 404]).toContain(response.status);
    }
  });

  it("falls back to the app shell for client-side routes", async () => {
    const { base } = await serve();
    const response = await fetch(`${base}/runs/abc`);
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("AGENT_BLACKBOX_DAEMON_URL");
  });
});
