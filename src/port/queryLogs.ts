import { z } from "zod";
import type { CloudLoggingApi } from "../domain/api";
import type { LogCache } from "../domain/cache";
import { createQueryLogsOutput } from "../domain/query-logs";
import { buildQueryLogsFilter } from "../domain/query-logs-filter";
import type { Tool } from "./types";
import { createSuccessResponse, createErrorResponse } from "./types";

export const queryLogsInputSchema = z.object({
  projectId: z.string().describe("Google Cloud project ID. If unknown, call listProjects first to discover available projects."),
  filter: z.string().describe("Cloud Logging filter expression. Use SEARCH() for full-text search, field comparisons for specific filters. Examples: severity>=ERROR, resource.type=\"k8s_container\", SEARCH(\"error message\"). NOTE: When using SEARCH() with field filters, always join them with AND (e.g. resource.type=\"gae_app\" AND SEARCH(\"timeout\")); without AND the filter may silently return no results."),
  startTime: z.string().describe("Start time in ISO 8601 format (e.g., '2024-01-01T00:00:00Z')"),
  endTime: z.string().describe("End time in ISO 8601 format (e.g., '2024-01-01T23:59:59Z')"),
  resourceNames: z
    .array(z.string())
    .optional()
    .describe("Scope the query to specific resources instead of the full project. Use 'organizations/<orgId>' to query organization-level audit logs (e.g. org policy changes, IAM changes). Example: ['organizations/123456789']. Note: projectId is still required as the auth anchor even when resourceNames is set. Project-level logs are scoped automatically via projectId — only set this when querying org-level or cross-project resources."),
  pageSize: z.number().optional(),
  pageToken: z.string().optional(),
  orderBy: z
    .object({
      timestamp: z.enum(["asc", "desc"]),
    })
    .optional(),
  summaryFields: z
    .array(z.string())
    .optional()
    .describe("Fields to include in per-entry summaries. Works for plain JSON fields: textPayload, jsonPayload.*, httpRequest.*, labels.*, resource.labels.*. Does NOT expand protobuf-encoded paths (e.g. protoPayload.methodName, protoPayload.authenticationInfo.*) — use getLogDetail to read the full decoded content of those entries."),
});

type QueryLogsInput = z.infer<typeof queryLogsInputSchema>;

export const queryLogsTool = (dependencies: {
  api: CloudLoggingApi;
  cache: LogCache;
}): Tool<typeof queryLogsInputSchema> => {
  return {
    name: "queryLogs",
    description: `Query Google Cloud logs using the powerful Cloud Logging filter syntax.

FILTER SYNTAX:
- Operators: = != > >= < <= : (contains) =~ (regex match) !~ (regex not match)
- Boolean: AND OR NOT and parentheses ()
- Common fields: severity, timestamp, resource.type, resource.labels.*, textPayload, jsonPayload.*, labels.*, logName

SEARCH FUNCTION:
Use SEARCH("text") for full-text search across all fields. Case-insensitive, searches nested JSON.
IMPORTANT: Always combine SEARCH() with field filters using AND: resource.type="gae_app" AND SEARCH("timeout").
Without AND, the filter may silently return no results.

COMMON RESOURCE TYPES:
- App Engine service: resource.type="gae_app" AND resource.labels.module_id="my-service"
- Cloud Run service: resource.type="cloud_run_revision" AND resource.labels.service_name="my-service"
- Cloud Function: resource.type="cloud_function" AND resource.labels.function_name="my-fn"
- GKE container: resource.type="k8s_container" AND resource.labels.namespace_name="prod"
- Pub/Sub subscription: resource.type="pubsub_subscription"
- Compute Engine VM: resource.type="gce_instance"

FILTER EXAMPLES:
- Severity: severity>=ERROR, severity=WARNING
- Resource: resource.type="k8s_container", resource.labels.namespace_name="prod"
- Text search: textPayload:"error", jsonPayload.message:"timeout", SEARCH("OutOfMemoryError")
- Complex: resource.type="cloud_run_revision" AND severity>=ERROR AND SEARCH("database")
- JSON queries: jsonPayload.request.method="POST", jsonPayload.response.status>=500
- Regex: textPayload=~"Error: .*timeout.*"
- Pub/Sub audit: SEARCH("my-subscription-name") AND logName:"cloudaudit.googleapis.com"
- Org policy changes: protoPayload.serviceName="orgpolicy.googleapis.com" (use with resourceNames: ["organizations/<orgId>"])

ORG-LEVEL LOGS:
To query organization audit logs (org policies, IAM changes), pass resourceNames: ["organizations/<orgId>"] along with any valid projectId as auth anchor. These logs are not accessible at project scope.

SUMMARIES AND FULL CONTENT:
Log summaries are truncated for long payloads. To read the full content of a specific log entry, call getLogDetail with the entry's id field. summaryFields works for JSON fields only — not for protobuf-encoded fields (protoPayload.*).

Time range is REQUIRED. Use ISO 8601 format for startTime/endTime.`,
    inputSchema: queryLogsInputSchema,
    handler: async ({
      input,
    }: {
      input: QueryLogsInput;
    }): Promise<{ content: Array<{ type: "text"; text: string }> }> => {
      const projectId = input.projectId;
      const startTime = Date.now();

      try {
        const filterResult = buildQueryLogsFilter(input);
        if (filterResult.isErr()) {
          return createErrorResponse(
            "INVALID_FILTER",
            filterResult.error.message,
            {
              suggestion: "Check the filter syntax. Use SEARCH() for full-text search, or field comparisons like severity>=ERROR",
              retryable: false,
            }
          );
        }
        
        // Call the Cloud Logging API to get entries
        const result = await dependencies.api.entries({
          projectId,
          filter: filterResult.value,
          resourceNames: input.resourceNames,
          pageSize: input.pageSize,
          pageToken: input.pageToken,
          orderBy: input.orderBy,
        });

        if (result.isErr()) {
          const errorCode = result.error.code ?? "UNKNOWN_ERROR";
          const isAuthError = errorCode === "UNAUTHENTICATED" || errorCode === "PERMISSION_DENIED";
          return createErrorResponse(
            errorCode,
            result.error.message,
            {
              suggestion: isAuthError 
                ? "Check authentication: run 'gcloud auth application-default login' or verify GOOGLE_CLOUD_PROJECT is set"
                : "Verify the project ID and filter syntax are correct",
              retryable: errorCode === "UNAVAILABLE" || errorCode === "INTERNAL",
            }
          );
        }

        const { entries, nextPageToken } = result.value;
        const executionTimeMs = Date.now() - startTime;

        // Cache each log entry
        for (const entry of entries) {
          dependencies.cache.add(entry.insertId, entry);
        }

        // Transform entries to the expected output format
        const output = createQueryLogsOutput(entries, nextPageToken, input.summaryFields);

        return createSuccessResponse(output, {
          executionTimeMs,
          totalCount: entries.length,
          nextPageToken,
          cached: false,
        });
      } catch (error) {
        return createErrorResponse(
          "INTERNAL_ERROR",
          error instanceof Error ? error.message : String(error),
          {
            suggestion: "This is an unexpected error. Please check the server logs for more details.",
            retryable: true,
          }
        );
      }
    },
  };
};
