/**
 * MCP tool handler for log aggregation
 */

import { z } from "zod";
import type { CloudLoggingApi } from "../domain/api";
import type { Tool } from "./types";
import type { AggregationInput } from "../domain/aggregate-logs";
import { createSuccessResponse, createErrorResponse } from "./types";

/**
 * Zod schema for aggregation input
 */
const aggregateLogsInputSchema = z.object({
  projectId: z.string().describe("Google Cloud project ID"),
  startTime: z.string().describe("Start time in ISO 8601 format (e.g., '2024-01-01T00:00:00Z')"),
  endTime: z.string().describe("End time in ISO 8601 format (e.g., '2024-01-01T23:59:59Z')"),
  filter: z.string().optional().describe("Additional filter expression (e.g., 'severity>=ERROR')"),
  aggregation: z.discriminatedUnion("type", [
    z.object({
      type: z.literal("count").describe("Count total number of log entries"),
    }),
    z.object({
      type: z.literal("group_by").describe("Group logs by specific fields"),
      groupBy: z.array(z.string()).min(1).describe("Fields to group by (e.g., ['severity', 'resource.type'])"),
    }),
    z.object({
      type: z.literal("time_series").describe("Aggregate logs over time intervals"),
      timeInterval: z.enum(["1m", "5m", "15m", "30m", "1h", "6h", "12h", "24h"]).describe("Time bucket interval"),
    }),
  ]).describe("Aggregation configuration"),
  pageSize: z.number().optional().describe("Maximum number of log entries to fetch (default: 1000)"),
  pageToken: z.string().optional().describe("Page token for pagination"),
});

/**
 * Creates the aggregateLogs tool
 */
export function createAggregateLogsTool(api: CloudLoggingApi): Tool<typeof aggregateLogsInputSchema> {
  return {
    name: "aggregateLogs",
    description: `Aggregate and analyze logs from Google Cloud Logging with various aggregation methods:

- **count**: Count total number of log entries matching the filter
- **group_by**: Group logs by specific fields (e.g., severity, resource type, labels) and count entries in each group
- **time_series**: Aggregate logs over time intervals to see trends

Examples:
- Count errors in the last hour: aggregation={type: "count"}, filter="severity>=ERROR"
- Group by severity: aggregation={type: "group_by", groupBy: ["severity"]}
- Error trends per 5 minutes: aggregation={type: "time_series", timeInterval: "5m"}, filter="severity=ERROR"`,
    inputSchema: aggregateLogsInputSchema,
    handler: async ({ input }): Promise<{ content: Array<{ type: "text"; text: string }> }> => {
      const startTime = Date.now();

      try {
        // Convert Zod input to domain input
        const domainInput: AggregationInput = {
          projectId: input.projectId,
          startTime: input.startTime,
          endTime: input.endTime,
          filter: input.filter,
          aggregation: input.aggregation,
          pageSize: input.pageSize,
          pageToken: input.pageToken,
        };

        const result = await api.aggregate(domainInput);

        if (result.isErr()) {
          const errorCode = result.error.code ?? "INTERNAL";
          return createErrorResponse(
            errorCode === "INVALID_ARGUMENT" ? "INVALID_REQUEST" : "INTERNAL_ERROR",
            result.error.message,
            {
              suggestion: errorCode === "INVALID_ARGUMENT" 
                ? "Check your aggregation parameters and time range"
                : "Verify your Google Cloud credentials and project access",
              retryable: errorCode !== "INVALID_ARGUMENT",
            }
          );
        }

        const { aggregation, nextPageToken } = result.value;

        // Format output based on aggregation type
        const summary: string = ((): string => {
          switch (aggregation.type) {
            case "count": {
              const totalCount = aggregation.results[0]?.count ?? 0;
              return `Total log entries: ${totalCount}`;
            }
            case "group_by": {
              const groups = aggregation.results;
              const totalCount = groups.reduce((sum, g) => sum + g.count, 0);
              return `Found ${groups.length} unique groups (${totalCount} total entries):\n\n${groups
                .map((g) => {
                  const groupKeys = Object.entries(g.group)
                    .map(([key, value]) => `${key}=${value}`)
                    .join(", ");
                  return `- ${groupKeys}: ${g.count} entries`;
                })
                .join("\n")}`;
            }
            case "time_series": {
              const buckets = aggregation.results;
              const totalCount = buckets.reduce((sum, b) => sum + b.count, 0);
              return `Time series with ${buckets.length} data points (${totalCount} total entries):\n\n${buckets
                .map((b) => `- ${b.timestamp}: ${b.count} entries`)
                .join("\n")}`;
            }
          }
        })();

        const totalCount = ((): number => {
          switch (aggregation.type) {
            case "count":
              return aggregation.results[0]?.count ?? 0;
            case "group_by":
              return aggregation.results.reduce((sum, g) => sum + g.count, 0);
            case "time_series":
              return aggregation.results.reduce((sum, b) => sum + b.count, 0);
          }
        })();

        return createSuccessResponse(
          {
            summary,
            aggregationType: aggregation.type,
            results: aggregation.results,
          },
          {
            executionTimeMs: Date.now() - startTime,
            totalCount,
            nextPageToken,
          }
        );
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return createErrorResponse(
          "INTERNAL_ERROR",
          `Unexpected error during aggregation: ${errorMessage}`,
          {
            retryable: true,
          }
        );
      }
    },
  };
}

