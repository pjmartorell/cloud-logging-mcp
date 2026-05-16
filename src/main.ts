#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";
import { fileURLToPath } from "node:url";
import { validateEnvironmentOrThrow } from "./util/env-validation.js";
import { realpathSync } from "node:fs";
import { resolve } from "node:path";

/**
 * STDIO transport for backwards compatibility
 * This file runs when executing: node dist/index.js or npm start
 * Smithery CLI uses the exported createMcpServer() from index.ts for HTTP transport
 */
async function main(): Promise<void> {
  // Validate environment before starting the server
  // Note: When running via Smithery CLI, validation happens after config is applied
  validateEnvironmentOrThrow();
  
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("MCP Server running in STDIO mode");
}

function realpathOrOriginal(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
}

export function isMainModule(moduleUrl: string, argvPath: string | undefined = process.argv[1]): boolean {
  if (argvPath === undefined || argvPath === "") {
    return false;
  }

  const modulePath = realpathOrOriginal(fileURLToPath(moduleUrl));
  const invokedPath = realpathOrOriginal(resolve(argvPath));

  return modulePath === invokedPath;
}

// Node/tsx/npx-compatible "main module" check.
const isMain = isMainModule(import.meta.url);

if (isMain === true) {
  main().catch((error: unknown) => {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Server error:", errorMessage);
    process.exit(1);
  });
}