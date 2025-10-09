import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server";
import { fileURLToPath } from "node:url";

// Node/tsx-compatible "main module" check
const isMain = Boolean(process.argv[1]) && fileURLToPath(import.meta.url) === process.argv[1];

if (isMain === true) {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}