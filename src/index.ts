import { createServer, configSchema, type Config } from "./server.js";

// Export config schema for Smithery CLI
export { configSchema };

/**
 * Default export for Smithery CLI
 * This function is automatically called by Smithery CLI with HTTP transport
 */
export default function createMcpServer({ config }: { config: Config }): ReturnType<typeof createServer> {
  return createServer(config);
}

