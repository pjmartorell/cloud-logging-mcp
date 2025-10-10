/**
 * MCP tool handler for querying log-based metrics
 */

import { z } from "zod";
import type { CloudLoggingApi } from "../domain/api";
import type { Tool } from "./types";
import type { LogMetricsInput } from "../domain/log-metrics";
import { createSuccessResponse, createErrorResponse } from "./types";

/**
 * Zod schema for log metrics input
 */
const logMetricsInputSchema = z.object({
  projectId: z.string().describe("Google Cloud project ID"),
  metricName: z.string().describe("Name of the log-based metric (e.g., 'my-error-metric' or 'logging.googleapis.com/user/my-error-metric')"),
  startTime: z.string().describe("Start time in ISO 8601 format (e.g., '2024-01-01T00:00:00Z')"),
  endTime: z.string().describe("End time in ISO 8601 format (e.g., '2024-01-01T23:59:59Z')"),
  aggregation: z.enum(["sum", "count", "rate", "distribution"]).optional().describe("Type of aggregation to apply"),
  alignmentPeriod: z.string().optional().describe("Time bucket size (e.g., '60s', '5m', '1h', '1d')"),
});

/**
 * Creates the queryLogMetrics tool
 */
export function createLogMetricsTool(api: CloudLoggingApi): Tool<typeof logMetricsInputSchema> {
  return {
    name: "queryLogMetrics",
    description: `Query log-based metrics from Google Cloud Monitoring.

Log-based metrics are user-defined metrics that track specific log patterns and can be queried as time series data.

**Use Cases**:
- "Show me the 'database-errors' metric for the last 24 hours"
- "What's the rate of 404 errors over time?"
- "Display error count metrics aggregated per hour"

**Metric Name Format**:
- Simple name: "my-error-metric" (will be expanded to full name)
- Full name: "logging.googleapis.com/user/my-error-metric"

**Aggregation Types**:
- sum: Sum of values over time
- count: Count of occurrences
- rate: Rate of change over time
- distribution: Distribution of values (for histogram metrics)

**Alignment Period**:
- Controls time bucket size for aggregation
- Examples: "60s" (1 minute), "5m" (5 minutes), "1h" (1 hour), "1d" (1 day)`,
    inputSchema: logMetricsInputSchema,
    handler: async ({ input }): Promise<{ content: Array<{ type: "text"; text: string }> }> => {
      const startTime = Date.now();

      try {
        // Convert Zod input to domain input
        const domainInput: LogMetricsInput = {
          projectId: input.projectId,
          metricName: input.metricName,
          startTime: input.startTime,
          endTime: input.endTime,
          aggregation: input.aggregation,
          alignmentPeriod: input.alignmentPeriod,
        };

        const result = await api.queryLogMetrics(domainInput);

        if (result.isErr()) {
          const errorCode = result.error.code ?? "INTERNAL";
          return createErrorResponse(
            errorCode === "INVALID_ARGUMENT" ? "INVALID_REQUEST" 
            : errorCode === "NOT_FOUND" ? "NOT_FOUND"
            : errorCode === "PERMISSION_DENIED" ? "PERMISSION_DENIED"
            : "INTERNAL_ERROR",
            result.error.message,
            {
              suggestion: errorCode === "NOT_FOUND"
                ? "Check that the metric exists and you have permission to access it. List metrics with 'gcloud logging metrics list'."
                : errorCode === "PERMISSION_DENIED"
                ? "Ensure you have 'monitoring.timeSeries.list' permission (roles/monitoring.viewer or equivalent)"
                : errorCode === "INVALID_ARGUMENT"
                ? "Check your metric name, time range, and alignment period format"
                : "Verify your Google Cloud credentials and project access",
              retryable: errorCode !== "INVALID_ARGUMENT" && errorCode !== "NOT_FOUND",
            }
          );
        }

        const { metric } = result.value;

        // Format summary
        const summary: string = ((): string => {
          if (metric.points.length === 0) {
            return `No data points found for metric '${metric.name}' in the specified time range.`;
          }

          const totalValue = metric.points.reduce((sum, point) => sum + point.value, 0);
          const avgValue = totalValue / metric.points.length;
          const maxValue = Math.max(...metric.points.map(p => p.value));
          const minValue = Math.min(...metric.points.map(p => p.value));

          return `Metric: ${metric.name}
Time Range: ${input.startTime} to ${input.endTime}
Data Points: ${metric.points.length}
Total Value: ${totalValue.toFixed(2)}
Average: ${avgValue.toFixed(2)}
Min: ${minValue.toFixed(2)}
Max: ${maxValue.toFixed(2)}`;
        })();

        return createSuccessResponse(
          {
            summary,
            metric: {
              name: metric.name,
              type: metric.type,
              points: metric.points,
            },
          },
          {
            executionTimeMs: Date.now() - startTime,
            totalCount: metric.points.length,
          }
        );
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return createErrorResponse(
          "INTERNAL_ERROR",
          `Unexpected error querying metrics: ${errorMessage}`,
          {
            retryable: true,
          }
        );
      }
    },
  };
}

