import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, test } from "vitest";
import { isMainModule } from "./main";

describe("isMainModule", () => {
  test("detects an npx-style symlinked bin as the main module", () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), "cloud-logging-mcp-"));

    try {
      const targetPath = join(tempDirectory, "dist-main.js");
      const symlinkPath = join(tempDirectory, "cloud-logging-mcp");

      writeFileSync(targetPath, "");
      symlinkSync(targetPath, symlinkPath);

      expect(isMainModule(pathToFileURL(targetPath).href, symlinkPath)).toBe(true);
    } finally {
      rmSync(tempDirectory, { recursive: true, force: true });
    }
  });

  test("returns false when the module is imported", () => {
    const moduleUrl = pathToFileURL("/tmp/cloud-logging-mcp/main.js").href;

    expect(isMainModule(moduleUrl, undefined)).toBe(false);
  });
});
