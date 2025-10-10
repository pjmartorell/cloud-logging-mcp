import type { z } from "zod";

/**
 * Structured error response for tools
 */
export interface ToolError {
  error: {
    code: string;
    message: string;
    suggestion?: string;
    retryable: boolean;
    details?: Record<string, unknown>;
  };
}

/**
 * Success response with optional metadata
 */
export interface ToolSuccess<T = unknown> {
  data: T;
  metadata?: {
    cached?: boolean;
    executionTimeMs?: number;
    nextPageToken?: string;
    totalCount?: number;
    [key: string]: unknown;
  };
}

/**
 * Standard MCP tool response
 */
export interface ToolResponse {
  content: Array<{ type: "text"; text: string }>;
}

/**
 * Helper to create success response
 */
export function createSuccessResponse<T>(data: T, metadata?: ToolSuccess<T>['metadata']): ToolResponse {
  const response: ToolSuccess<T> = { data, metadata };
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(response, null, 2),
      },
    ],
  };
}

/**
 * Helper to create error response
 */
export function createErrorResponse(
  code: string,
  message: string,
  options?: {
    suggestion?: string;
    retryable?: boolean;
    details?: Record<string, unknown>;
  }
): ToolResponse {
  const error: ToolError = {
    error: {
      code,
      message,
      suggestion: options?.suggestion,
      retryable: options?.retryable ?? false,
      details: options?.details,
    },
  };
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(error, null, 2),
      },
    ],
  };
}

/**
 * Common type for MCP tools
 */
export type Tool<InputSchema extends z.ZodTypeAny> = {
  name: string;
  description: string;
  inputSchema: InputSchema;
  handler: (args: { input: z.infer<InputSchema> }) => Promise<{ content: Array<{ type: "text"; text: string }> }>;
};