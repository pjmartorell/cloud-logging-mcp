import type { CloudLoggingApi } from "../domain/api.js";
import type { LogCache } from "../domain/cache.js";
import { getLogDetailTool } from "./getLogDetail.js";
import { queryLogsTool } from "./queryLogs.js";
import { listProjects } from "./listProjects.js";
import { createAggregateLogsTool } from "./aggregate-logs.js";
import { createLogMetricsTool } from "./log-metrics.js";

export const createTools = (dependencies: {
  api: CloudLoggingApi;
  cache: LogCache;
}): {
  queryLogs: ReturnType<typeof queryLogsTool>;
  getLogDetail: ReturnType<typeof getLogDetailTool>;
  listProjects: ReturnType<typeof listProjects>;
  aggregateLogs: ReturnType<typeof createAggregateLogsTool>;
  queryLogMetrics: ReturnType<typeof createLogMetricsTool>;
} => {
  return {
    queryLogs: queryLogsTool(dependencies),
    getLogDetail: getLogDetailTool(dependencies),
    listProjects: listProjects(dependencies.api),
    aggregateLogs: createAggregateLogsTool(dependencies.api),
    queryLogMetrics: createLogMetricsTool(dependencies.api),
  };
};

// Export types for external use
export type { ToolError, ToolSuccess, ToolResponse } from "./types.js";
export { createSuccessResponse, createErrorResponse } from "./types.js";
