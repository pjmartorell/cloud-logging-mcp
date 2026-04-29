import { z } from "zod";
import type { CloudLoggingApi } from "../domain/api.js";
import type { ListProjectsOutput } from "../domain/list-projects.js";
import type { Tool } from "./types";
import { createSuccessResponse, createErrorResponse } from "./types";

const ListProjectsInputSchema = z.object({
  filter: z.string().optional().describe("Optional filter to apply to the project list"),
  pageSize: z.number().optional().describe("Number of projects to return (default: 100)"),
  pageToken: z.string().optional().describe("Page token for pagination"),
});

export const listProjects = (api: CloudLoggingApi): Tool<typeof ListProjectsInputSchema> => {
  return {
    name: "listProjects",
    description: "Lists available Google Cloud projects that the authenticated user has access to",
    inputSchema: ListProjectsInputSchema,
    handler: async ({ input }): Promise<{ content: Array<{ type: "text"; text: string }> }> => {
      const startTime = Date.now();
      
      try {
        const result: ListProjectsOutput = await api.listProjects(input);
        const { projects, nextPageToken } = result;

        return createSuccessResponse(
          {
            projects: projects.map((p) => ({
              projectId: p.projectId,
              displayName: p.displayName ?? p.name,
              state: p.state,
              createTime: p.createTime,
            })),
          },
          {
            executionTimeMs: Date.now() - startTime,
            totalCount: projects.length,
            nextPageToken,
          }
        );
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const isAuthError = errorMessage.includes("authentication") || errorMessage.includes("permission");
        const isInvalidArgument = errorMessage.includes("invalid") || errorMessage.includes("INVALID_ARGUMENT");
        
        return createErrorResponse(
          isAuthError ? "AUTHENTICATION_ERROR" : "INTERNAL_ERROR",
          `Error listing projects: ${errorMessage}`,
          {
            suggestion: isAuthError
              ? "Check authentication: run 'gcloud auth application-default login'"
              : isInvalidArgument
                ? "Check your request parameters (filter, pageToken, pageSize)"
                : "Verify your Google Cloud credentials are properly configured",
            retryable: !isAuthError && !isInvalidArgument,
          }
        );
      }
    },
  };
};