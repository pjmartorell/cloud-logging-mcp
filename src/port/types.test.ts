import { describe, expect, it } from 'vitest';
import { createSuccessResponse, createErrorResponse, type ToolSuccess, type ToolError } from './types';

describe('Tool Response Helpers', () => {
  describe('createSuccessResponse', () => {
    it('should create a success response with data', () => {
      const response = createSuccessResponse({ test: 'data' });

      expect(response).toEqual({
        content: [
          {
            type: 'text',
            text: JSON.stringify({ data: { test: 'data' } }, null, 2),
          },
        ],
      });
    });

    it('should include metadata when provided', () => {
      const response = createSuccessResponse(
        { results: [] },
        {
          executionTimeMs: 123,
          totalCount: 0,
          cached: true,
        }
      );

      const content = response.content[0];
      expect(content).toBeDefined();
      if (content === undefined) return;
      
      const parsed = JSON.parse(content.text) as ToolSuccess<{ results: unknown[] }>;
      expect(parsed.data).toEqual({ results: [] });
      expect(parsed.metadata?.executionTimeMs).toBe(123);
      expect(parsed.metadata?.totalCount).toBe(0);
      expect(parsed.metadata?.cached).toBe(true);
    });
  });

  describe('createErrorResponse', () => {
    it('should create an error response with code and message', () => {
      const response = createErrorResponse('TEST_ERROR', 'Something went wrong');

      const content = response.content[0];
      expect(content).toBeDefined();
      if (content === undefined) return;
      
      const parsed = JSON.parse(content.text) as ToolError;
      expect(parsed.error.code).toBe('TEST_ERROR');
      expect(parsed.error.message).toBe('Something went wrong');
      expect(parsed.error.retryable).toBe(false);
    });

    it('should include suggestion and retryable flag', () => {
      const response = createErrorResponse(
        'NETWORK_ERROR',
        'Connection timeout',
        {
          suggestion: 'Check your network connection',
          retryable: true,
        }
      );

      const content = response.content[0];
      expect(content).toBeDefined();
      if (content === undefined) return;
      
      const parsed = JSON.parse(content.text) as ToolError;
      expect(parsed.error.code).toBe('NETWORK_ERROR');
      expect(parsed.error.suggestion).toBe('Check your network connection');
      expect(parsed.error.retryable).toBe(true);
    });

    it('should include additional details', () => {
      const response = createErrorResponse(
        'VALIDATION_ERROR',
        'Invalid input',
        {
          details: {
            field: 'email',
            reason: 'invalid format',
          },
        }
      );

      const content = response.content[0];
      expect(content).toBeDefined();
      if (content === undefined) return;
      
      const parsed = JSON.parse(content.text) as ToolError;
      expect(parsed.error.details).toEqual({
        field: 'email',
        reason: 'invalid format',
      });
    });
  });
});

