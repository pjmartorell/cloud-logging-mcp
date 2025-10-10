# MCP Tool Improvements

This document outlines improvements to the Google Cloud Logging MCP server, including both completed enhancements and future planned features.

## ✅ Completed Improvements

### 1. Structured Error Responses ✓
**Status**: Completed

**What Changed**:
- Added `ToolError`, `ToolSuccess`, and `ToolResponse` types in `src/port/types.ts`
- Created `createSuccessResponse()` and `createErrorResponse()` helper functions
- All tools now return structured responses with:
  - Error code (e.g., `PERMISSION_DENIED`, `INVALID_FILTER`)
  - Error message
  - Actionable suggestions
  - Retryable flag
  - Optional additional details

**Benefits**:
- LLMs can better understand and act on errors
- Users get clear guidance on how to fix issues
- Consistent error format across all tools

**Example Error Response**:
```json
{
  "error": {
    "code": "PERMISSION_DENIED",
    "message": "User lacks logging.logEntries.list permission",
    "suggestion": "Check authentication: run 'gcloud auth application-default login' or verify GOOGLE_CLOUD_PROJECT is set",
    "retryable": false
  }
}
```

### 2. Enhanced Response Metadata ✓
**Status**: Completed

**What Changed**:
- All successful responses now include metadata:
  - `executionTimeMs`: Time taken to execute the request
  - `totalCount`: Number of results returned
  - `nextPageToken`: For pagination
  - `cached`: Whether result was served from cache

**Benefits**:
- Better observability for debugging
- Performance insights
- Cache hit/miss visibility

**Example Success Response**:
```json
{
  "data": {
    "entries": [...]
  },
  "metadata": {
    "executionTimeMs": 234,
    "totalCount": 10,
    "nextPageToken": "ABC123",
    "cached": false
  }
}
```

### 3. Improved Tool Descriptions ✓
**Status**: Already comprehensive

**Current State**:
- All tools have detailed descriptions with examples
- Filter syntax documented inline
- Common use cases provided

### 4. Query Improvements ✓
**Status**: Completed

**What Changed**:
- Added execution time tracking
- Added total count in metadata
- Pagination info already included
- Better error messages with suggestions

---

## 📋 Planned Improvements

### 5. Aggregate Logs Tool
**Status**: Not Started
**Priority**: High
**Estimated Effort**: Medium

**Description**:
A new tool for aggregating and analyzing logs without retrieving full entries. Useful for understanding patterns, trends, and statistics.

**Input Schema**:
```typescript
{
  projectId: string;
  filter: string;
  startTime: string; // ISO 8601
  endTime: string;   // ISO 8601
  aggregation: {
    type: "count" | "group_by" | "time_series";
    groupBy?: string[];        // e.g., ["severity", "resource.type"]
    timeInterval?: "1m" | "5m" | "1h" | "1d";  // For time_series
  };
  pageSize?: number;
  pageToken?: string;
}
```

**Output**:
```typescript
{
  data: {
    aggregation: {
      type: "count" | "group_by" | "time_series";
      results: Array<{
        key?: Record<string, string>;  // For group_by
        timestamp?: string;             // For time_series
        count: number;
      }>;
    };
  };
  metadata: {
    executionTimeMs: number;
    totalGroups: number;
    nextPageToken?: string;
  };
}
```

**Implementation Guide**:
1. **Domain Layer** (`src/domain/aggregate-logs.ts`):
   - Create `AggregationInput` and `AggregationOutput` types
   - Implement `buildAggregationQuery()` to construct API request
   - Implement `processAggregationResults()` to format response

2. **API Layer** (extend `src/adapter/api.ts`):
   - Add `aggregate(params): Result<AggregationOutput, CloudLoggingError>` method
   - Use Cloud Logging API's aggregation features
   - May need to fetch and process locally for complex group_by

3. **Port Layer** (`src/port/aggregateLogs.ts`):
   - Define Zod schema for input validation
   - Create tool handler using new domain functions
   - Register in `src/port/index.ts`

4. **Server Registration** (`src/server.ts`):
   - Add tool registration for `aggregateLogs`

5. **Tests**:
   - Unit tests for domain logic
   - Integration tests with mock API
   - E2E test with real API (skipped by default)

**Use Cases**:
- "How many ERROR logs in the last hour?"
- "Show me log counts grouped by severity and resource type"
- "What's the error rate over time in 5-minute intervals?"

---

### 6. Log Metrics Tool
**Status**: Not Started
**Priority**: Medium
**Estimated Effort**: Medium

**Description**:
Query log-based metrics created in Google Cloud Logging. These are user-defined metrics that track specific log patterns.

**Input Schema**:
```typescript
{
  projectId: string;
  metricName: string;  // e.g., "my-error-metric"
  startTime: string;
  endTime: string;
  aggregation?: "sum" | "count" | "rate" | "distribution";
  alignmentPeriod?: string;  // e.g., "60s", "300s"
}
```

**Output**:
```typescript
{
  data: {
    metric: {
      name: string;
      type: string;
      points: Array<{
        timestamp: string;
        value: number;
      }>;
    };
  };
  metadata: {
    executionTimeMs: number;
    pointCount: number;
  };
}
```

**Implementation Guide**:
1. Use `@google-cloud/monitoring` package for Metrics API
2. Query time series data for log-based metrics
3. Format for easy LLM consumption

**Use Cases**:
- "Show me the 'database-errors' metric for the last 24 hours"
- "What's the rate of 404 errors over time?"

---

### 7. Suggest Queries Tool
**Status**: Not Started
**Priority**: Low
**Estimated Effort**: Large

**Description**:
Analyze recent logs and suggest useful queries based on common patterns, errors, and resource types.

**Input Schema**:
```typescript
{
  projectId: string;
  context?: "errors" | "performance" | "security" | "general";
  limit?: number;  // Number of suggestions, default 5
}
```

**Output**:
```typescript
{
  data: {
    suggestions: Array<{
      title: string;
      description: string;
      filter: string;
      reason: string;  // Why this query is suggested
      priority: "high" | "medium" | "low";
    }>;
  };
  metadata: {
    executionTimeMs: number;
    totalSuggestions: number;
    analysisWindow: string;  // e.g., "last 1 hour"
  };
}
```

**Implementation Guide**:
1. **Analysis Logic**:
   - Sample recent logs (last 1 hour)
   - Identify common error patterns
   - Find frequently occurring resource types
   - Detect anomalies (e.g., spike in errors)

2. **Suggestion Engine**:
   - Create query templates for common scenarios
   - Rank suggestions by relevance
   - Include explanation for each suggestion

3. **Caching**:
   - Cache suggestions for 15 minutes
   - Invalidate on context change

**Use Cases**:
- "What queries should I run to debug this system?"
- "Show me the most important logs from the last hour"

---

### 8. Tail Logs Tool
**Status**: Not Started
**Priority**: Low
**Estimated Effort**: Large

**Description**:
Watch logs in real-time for a specified duration. Useful for live debugging.

**Challenges**:
- MCP is request/response, not streaming
- Would need to poll repeatedly
- May not fit well with MCP paradigm

**Alternative Approach**:
Instead of a tool, provide a **resource** that the LLM can poll:
```typescript
// Resource: logs://tail/{projectId}?filter={filter}&duration={seconds}
```

**Input Schema**:
```typescript
{
  projectId: string;
  filter: string;
  resourceNames?: string[];
  duration?: number;  // seconds to watch, default 60
  refreshInterval?: number;  // poll interval, default 5
}
```

**Implementation Guide**:
1. Not a traditional tool - more like a polling mechanism
2. Return most recent logs since last poll
3. Include timestamp of last seen log for next poll

**Recommendation**: 
Defer this until MCP supports streaming or implement as a separate CLI tool.

---

### 9. Export Logs Tool
**Status**: Not Started
**Priority**: Low
**Estimated Effort**: Very Large

**Description**:
Export logs to Cloud Storage or BigQuery for long-term analysis.

**Challenges**:
- Requires additional Google Cloud APIs
- May require IAM permissions for destination
- Long-running operation (minutes to hours)
- Would need to return operation ID and check status later

**Input Schema**:
```typescript
{
  projectId: string;
  filter: string;
  startTime: string;
  endTime: string;
  destination: {
    type: "storage" | "bigquery";
    bucket?: string;           // for storage
    dataset?: string;          // for bigquery
    table?: string;            // for bigquery
  };
}
```

**Output**:
```typescript
{
  data: {
    operationId: string;
    status: "pending" | "running" | "completed" | "failed";
    destination: string;
    estimatedCompletionTime?: string;
  };
  metadata: {
    executionTimeMs: number;
  };
}
```

**Implementation Guide**:
1. Use Cloud Logging Export API
2. Create export sink
3. Return operation ID
4. Provide separate tool to check export status

**Recommendation**:
This is complex and may be better suited for the `gcloud` CLI. Consider if it's really needed for an MCP server focused on AI assistance.

---

## 🎯 Implementation Priority

Based on value vs. effort:

1. **High Priority - Implement First**:
   - ✅ Structured Error Responses (DONE)
   - ✅ Enhanced Response Metadata (DONE)
   - 🔄 Aggregate Logs Tool (TODO - High value, medium effort)

2. **Medium Priority**:
   - 🔄 Log Metrics Tool (TODO - Medium value, medium effort)

3. **Low Priority - Consider Later**:
   - Suggest Queries Tool (Low value for most use cases, high effort)
   - Tail Logs Tool (Doesn't fit MCP paradigm well)
   - Export Logs Tool (Better handled by gcloud CLI)

---

## 📚 Additional Resources

- [Cloud Logging API Documentation](https://cloud.google.com/logging/docs/reference/v2/rest)
- [MCP Protocol Specification](https://modelcontextprotocol.io/docs)
- [Google Cloud Node.js Client](https://github.com/googleapis/google-cloud-node)

---

## 🔄 Next Steps

To continue improving the MCP tools:

1. **Immediate** (Already Done):
   - ✅ Add structured error responses
   - ✅ Add response metadata
   - ✅ Improve error messages with suggestions

2. **Short Term** (Next Sprint):
   - [ ] Implement Aggregate Logs Tool
   - [ ] Add tests for new error response format
   - [ ] Update README with new response format examples

3. **Long Term** (Future Consideration):
   - [ ] Evaluate demand for Log Metrics Tool
   - [ ] Reassess Tail Logs after MCP streaming support
   - [ ] Consider if Export Logs is needed

---

## 💡 Contributing

When implementing new tools, follow this pattern:

1. **Domain Layer First**: Define types and pure business logic
2. **API Integration**: Add methods to `GoogleCloudLoggingApiClient`
3. **Port Layer**: Create tool with Zod schema and handler
4. **Tests**: Unit tests for domain, integration tests for port
5. **Documentation**: Update README with examples
6. **Server**: Register tool in `server.ts`

Always use the `createSuccessResponse()` and `createErrorResponse()` helpers for consistent response formatting.

