#!/usr/bin/env node
/**
 * Smoke test: simulates exactly how npx invokes the package via a .bin symlink.
 *
 * npx runs `node .bin/cloud-logging-mcp` where .bin/cloud-logging-mcp is a
 * symlink to dist/main.js. The isMain check must resolve symlinks on both sides
 * so the server actually starts instead of silently exiting.
 *
 * This test catches the regression where isMain was always false when invoked
 * through a symlink, causing the process to exit with code 0 and no output.
 */

import { mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";

const distMain = resolve("dist/main.js");
const tempDir = mkdtempSync(join(tmpdir(), "cloud-logging-mcp-smoke-"));
const symlinkBin = join(tempDir, "cloud-logging-mcp");

symlinkSync(distMain, symlinkBin);

const initMessage = JSON.stringify({
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "smoke-test", version: "1.0" },
  },
}) + "\n";

const child = spawn(process.execPath, [symlinkBin], {
  env: {
    ...process.env,
    GOOGLE_CLOUD_PROJECT: "smoke-test-project",
    HOME: process.env.HOME ?? "/tmp",
    CLOUDSDK_CONFIG: process.env.HOME ? `${process.env.HOME}/.config/gcloud` : "/tmp/.config/gcloud",
  },
  stdio: ["pipe", "pipe", "pipe"],
});

let stdout = "";
let stderr = "";

child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });

child.stdin.end(initMessage);

const exitCode = await new Promise((resolveExit) => {
  const timeout = setTimeout(() => {
    child.kill();
    resolveExit(1);
  }, 10_000);

  child.on("error", (error) => {
    clearTimeout(timeout);
    stderr += error.message;
    resolveExit(1);
  });

  child.on("exit", resolveExit);
  child.on("close", () => { clearTimeout(timeout); });
});

rmSync(tempDir, { recursive: true, force: true });

if (exitCode !== 0) {
  console.error("❌ npx smoke test FAILED — server exited with code", exitCode);
  if (stderr) console.error("stderr:", stderr);
  process.exit(1);
}

let response;
try {
  // stdout may contain multiple lines; find the JSON one
  const jsonLine = stdout.split("\n").find((l) => l.trim().startsWith("{"));
  response = JSON.parse(jsonLine ?? "");
} catch {
  console.error("❌ npx smoke test FAILED — server produced no valid JSON response");
  console.error("stdout:", stdout);
  console.error("stderr:", stderr);
  process.exit(1);
}

if (response?.result?.serverInfo?.name !== "Google Cloud Logging MCP") {
  console.error("❌ npx smoke test FAILED — unexpected response:", JSON.stringify(response));
  process.exit(1);
}

console.log("✅ npx smoke test passed — server responded correctly via .bin symlink");
