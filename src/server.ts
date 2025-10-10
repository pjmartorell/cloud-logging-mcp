import { McpServer, type ReadResourceCallback } from "@modelcontextprotocol/sdk/server/mcp.js";
import { GoogleCloudLoggingApiClient } from "./adapter/api";
import { LogCacheImpl } from "./adapter/cache";
import { createTools } from "./port";
import { performHealthCheck } from "./util/health-check";

export const createServer = (): McpServer => {
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