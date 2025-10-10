import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";
import { fileURLToPath } from "node:url";
import { validateEnvironmentOrThrow } from "./util/env-validation.js";

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

// Node/tsx-compatible "main module" check
const isMain = Boolean(process.argv[1]) && fileURLToPath(import.meta.url) === process.argv[1];

if (isMain === true) {
  main().catch((error: unknown) => {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Server error:", errorMessage);
    process.exit(1);
  });
}