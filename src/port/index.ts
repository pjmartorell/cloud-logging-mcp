import type { CloudLoggingApi } from "../domain/api";
import type { LogCache } from "../domain/cache";
import { getLogDetailTool } from "./getLogDetail";
import { queryLogsTool } from "./queryLogs";
import { listProjects } from "./listProjects";

export const createTools = (dependencies: {
  api: CloudLoggingApi;
  cache: LogCache;
}): {
  queryLogs: ReturnType<typeof queryLogsTool>;
  getLogDetail: ReturnType<typeof getLogDetailTool>;
  listProjects: ReturnType<typeof listProjects>;
} => {
  return {
    queryLogs: queryLogsTool(dependencies),
    getLogDetail: getLogDetailTool(dependencies),
    listProjects: listProjects(dependencies.api),
  };
};

// Export types for external use
export type { ToolError, ToolSuccess, ToolResponse } from "./types";
export { createSuccessResponse, createErrorResponse } from "./types";
