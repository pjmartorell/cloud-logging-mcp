import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";
import { fileURLToPath } from "node:url";
import { validateEnvironmentOrThrow } from "./util/env-validation.js";

// Node/tsx-compatible "main module" check
const isMain = Boolean(process.argv[1]) && fileURLToPath(import.meta.url) === process.argv[1];

if (isMain === true) {
  // Validate environment before starting the server
  // Note: When running via Smithery, validation happens after config is applied
  validateEnvironmentOrThrow();
  
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}