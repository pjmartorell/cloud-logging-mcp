import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createServer, configSchema, type Config } from "./server.js";

// Export config schema for Smithery
export { configSchema };

// Default export function for Smithery compatibility
export default function createMcpServer({ config }: { config?: Config }): McpServer {
  return createServer(config);
}

