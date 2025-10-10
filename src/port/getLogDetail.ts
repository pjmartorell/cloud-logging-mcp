import { z } from "zod";
import type { CloudLoggingApi } from "../domain/api";
import type { LogCache } from "../domain/cache";
import { createLogId } from "../domain/log-id";
import {
  buildLogFilter,
  formatLogEntry,
  formatError,
  formatNotFoundError,
} from "../domain/get-log-detail";
import type { Tool } from "./types";
import { createSuccessResponse, createErrorResponse } from "./types";

const inputSchema = z.object({
  projectId: z.string().describe("Google Cloud project ID"),
  logId: z.string(),
});

type GetLogDetailInput = z.infer<typeof inputSchema>;

export const getLogDetailTool = (dependencies: {
  api: CloudLoggingApi;
  cache: LogCache;
}): Tool<typeof inputSchema> => {
  return {
    name: "getLogDetail",
    description: "Returns the whole record of a log with the given ID",
    inputSchema: inputSchema,
    handler: async ({ input }: { input: GetLogDetailInput }): Promise<{ content: Array<{ type: "text"; text: string }> }> => {
      const projectId = input.projectId;
      const startTime = Date.now();

      // First check cache
      const logIdTyped = createLogId(input.logId);
      const cachedEntry = dependencies.cache.get(logIdTyped);
      if (cachedEntry) {
        return createSuccessResponse(
          JSON.parse(formatLogEntry(cachedEntry)),
          {
            cached: true,
            executionTimeMs: Date.now() - startTime,
          }
        );
      }

      // If not in cache, query from API
      const filter = buildLogFilter(input.logId);
      const result = await dependencies.api.entries({
        projectId,
        filter,
        pageSize: 1,
      });

      if (result.isErr()) {
        const errorCode = result.error.code ?? "UNKNOWN_ERROR";
        const isAuthError = errorCode === "UNAUTHENTICATED" || errorCode === "PERMISSION_DENIED";
        return createErrorResponse(
          errorCode,
          formatError(result.error),
          {
            suggestion: isAuthError
              ? "Check authentication: run 'gcloud auth application-default login' or verify GOOGLE_CLOUD_PROJECT is set"
              : "Verify the project ID and log ID are correct",
            retryable: errorCode === "UNAVAILABLE" || errorCode === "INTERNAL",
          }
        );
      }

      const entries = result.value.entries;
      if (entries.length === 0) {
        return createErrorResponse(
          "LOG_NOT_FOUND",
          formatNotFoundError(input.logId),
          {
            suggestion: "The log ID may be incorrect or the log may have been deleted. Check the ID from queryLogs results.",
            retryable: false,
          }
        );
      }

      const entry = entries[0];
      
      if (entry === undefined) {
        return createErrorResponse(
          "LOG_NOT_FOUND",
          formatNotFoundError(input.logId),
          {
            suggestion: "The log ID may be incorrect or the log may have been deleted. Check the ID from queryLogs results.",
            retryable: false,
          }
        );
      }
      
      // Add to cache for future requests
      dependencies.cache.add(logIdTyped, entry);

      return createSuccessResponse(
        JSON.parse(formatLogEntry(entry)),
        {
          cached: false,
          executionTimeMs: Date.now() - startTime,
        }
      );
    },
  };
};

