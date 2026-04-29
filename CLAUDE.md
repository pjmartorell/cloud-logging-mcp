# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Workflow

- Run `npm run check` periodically to verify types, linting, tests, and dependencies.
- After you've finished task, commit using the conventional commit format (see `.cursorrules`).

## Architecture

This is a Model Context Protocol (MCP) server for Google Cloud Logging following clean architecture:

### Core Flow
1. **MCP Request** → `server.ts` receives tool call (HTTP or STDIO transport)
2. **Tool Handler** → `/port` handlers validate input with Zod schemas
3. **Domain Logic** → `/domain` functions process business logic with Result types
4. **API Adapter** → `/adapter/api.ts` calls Google Cloud APIs
5. **Protobuf Decoder** → `/util/protobuf-decoder.ts` decodes audit log payloads
6. **Cache Layer** → `/adapter/cache.ts` stores recent log entries
7. **MCP Response** → Returns formatted response to Claude

### Available Tools
- `listProjects`: List accessible GCP projects with filtering and pagination
- `queryLogs`: Query logs with advanced filtering, time ranges, and field summarization
- `getLogDetail`: Retrieve full details for a specific log entry by ID
- `aggregateLogs`: Aggregate logs with time series and distribution analysis
- `queryLogMetrics`: Query log-based metrics for monitoring

### Key Architectural Decisions

**Transport Layer**
- Supports HTTP transport via Smithery (default: `npm run dev`)
- Supports STDIO transport for backward compatibility (`npm run dev:stdio`)
- HTTP transport enables better scalability and debugging

**Error Handling**
- Result types (neverthrow) for explicit error handling
- Zod schemas validate all external inputs
- Type-safe error mapping from Google Cloud API errors

**Domain Layer (`/domain`)**
- Pure functions with dependency injection
- Returns `Result<T, Error>` for explicit error handling
- LogId uses interface pattern (not branded types) to avoid assertions
- Each domain function takes dependencies as parameters
- Log summarization with HTTP request fallback and sensitive data redaction

**Port Layer (`/port`)**
- MCP tool definitions with Zod input schemas
- Converts Zod schemas to JSON Schema for MCP
- Handles tool routing via switch statements

**Adapter Layer (`/adapter`)**
- `api.ts`: Google Cloud API client with type-safe error mapping and protobuf decoding
- `cache.ts`: LRU cache with TTL for log entries
- `token-caching.ts`: Authentication token caching with 5-minute expiry buffer

**Utility Layer (`/util`)**
- `protobuf-decoder.ts`: Decodes Google Cloud audit log protobuf payloads using `protobufjs` and `google-proto-files`
- Handles `type.googleapis.com/google.cloud.audit.AuditLog` and other protobuf message types
- Provides readable JSON output instead of raw byte arrays


## Working with Google Cloud APIs

Authentication methods:
1. Application Default Credentials: `gcloud auth application-default login`
2. Service Account: `export GOOGLE_APPLICATION_CREDENTIALS="path/to/key.json"`

Project ID must be explicitly provided in tool calls or will be auto-detected from authenticated credentials.

The API client handles various timestamp formats from Google Cloud:
- ISO strings
- Date objects  
- Protobuf Timestamp objects with seconds/nanos

## Common Patterns

**Adding a New Tool**
1. Define input schema in `/port/newTool.ts` using Zod
2. Create domain function in `/domain/new-feature.ts` returning Result type
3. Add tool to `createTools` in `/port/index.ts`
4. Register in `server.ts` tools/list and tools/call handlers

**Type-Safe Error Handling**
```typescript
const result = await api.entries(params);
if (result.isErr()) {
  return err(result.error);
}
const { entries } = result.value;
```

