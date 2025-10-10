import { McpServer, type ReadResourceCallback } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { GoogleCloudLoggingApiClient } from "./adapter/api";
import { LogCacheImpl } from "./adapter/cache";
import { createTools } from "./port";
import { performHealthCheck } from "./util/health-check";

// Configuration schema for Smithery
export const configSchema = z.object({
  projectId: z.string().optional().describe("Google Cloud Project ID (optional, can be auto-detected)"),
  debug: z.boolean().default(false).describe("Enable debug logging for troubleshooting"),
  credentials: z.union([
    z.object({
      clientEmail: z.string().describe("Google Cloud service account client email"),
      privateKey: z.string().describe("Google Cloud service account private key"),
    }).describe("Service account credentials as environment variables"),
    z.object({
      keyFilePath: z.string().describe("Path to Google Cloud service account key file (JSON)"),
    }).describe("Service account credentials as a key file"),
    z.string().describe("Path to Google Cloud service account key file (JSON)"),
  ]).optional().describe("Google Cloud service account credentials (optional, uses Application Default Credentials if not provided)"),
});

export type Config = z.infer<typeof configSchema>;

export const createServer = (config?: Config): McpServer => {
  // Apply configuration from Smithery if provided
  if (config?.projectId !== undefined) {
    process.env.GOOGLE_CLOUD_PROJECT = config.projectId;
  }
  
  if (config?.debug === true) {
    process.env.DEBUG = "true";
    process.env.NODE_DEBUG = "google-auth";
  }
  
  if (config?.credentials !== undefined) {
    if (typeof config.credentials === 'string') {
      // Direct string path format
      process.env.GOOGLE_APPLICATION_CREDENTIALS = config.credentials;
    } else if ('clientEmail' in config.credentials && 'privateKey' in config.credentials) {
      // Using client email and private key directly
      process.env.GOOGLE_CLIENT_EMAIL = config.credentials.clientEmail;
      process.env.GOOGLE_PRIVATE_KEY = config.credentials.privateKey;
    } else if ('keyFilePath' in config.credentials) {
      // Using a key file path
      process.env.GOOGLE_APPLICATION_CREDENTIALS = config.credentials.keyFilePath;
    }
  }

  const server = new McpServer({
    name: "Google Cloud Logging MCP",
    version: "1.0.0",
  });

  const api = new GoogleCloudLoggingApiClient();
  const cache = new LogCacheImpl();
  const tools = createTools({ api, cache });

  // Register queryLogs tool
  server.tool(
    tools.queryLogs.name,
    tools.queryLogs.description,
    tools.queryLogs.inputSchema.shape,
    async (args, _extra) => {
      const result = await tools.queryLogs.handler({ input: args });
      return result;
    }
  );

  // Register getLogDetail tool
  server.tool(
    tools.getLogDetail.name,
    tools.getLogDetail.description,
    tools.getLogDetail.inputSchema.shape,
    async (args, _extra) => {
      const result = await tools.getLogDetail.handler({ input: args });
      return result;
    }
  );

  // Register listProjects tool
  server.tool(
    tools.listProjects.name,
    tools.listProjects.description,
    tools.listProjects.inputSchema.shape,
    async (args, _extra) => {
      const result = await tools.listProjects.handler({ input: args });
      return result;
    }
  );

  // Register aggregateLogs tool
  server.tool(
    tools.aggregateLogs.name,
    tools.aggregateLogs.description,
    tools.aggregateLogs.inputSchema.shape,
    async (args: unknown, _extra: unknown) => {
      // MCP SDK validates args against the schema before this handler is called
      const result = await tools.aggregateLogs.handler({ 
        input: args as z.infer<typeof tools.aggregateLogs.inputSchema> 
      });
      return result;
    }
  );

  // Register queryLogMetrics tool
  server.tool(
    tools.queryLogMetrics.name,
    tools.queryLogMetrics.description,
    tools.queryLogMetrics.inputSchema.shape,
    async (args: unknown, _extra: unknown) => {
      const result = await tools.queryLogMetrics.handler({ 
        input: args as z.infer<typeof tools.queryLogMetrics.inputSchema> 
      });
      return result;
    }
  );

  // Register health check resource
  const healthCheckCallback: ReadResourceCallback = async (uri, _extra) => {
    const healthStatus = await performHealthCheck(api);
    return {
      contents: [
        {
          uri: uri.toString(),
          mimeType: "application/json",
          text: JSON.stringify(healthStatus, null, 2),
        },
      ],
    };
  };
  
  server.resource(
    "Health Status",
    "health://status",
    healthCheckCallback
  );

  return server;
};