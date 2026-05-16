# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.3] - 2026-05-16

### Fixed
- README install configs for Cursor and Claude Desktop now include required `HOME` and `CLOUDSDK_CONFIG` env vars with explanations
- Added `GOOGLE_CLOUD_PROJECT` as documented optional env var

## [1.0.2] - 2026-05-16

### Added
- `bin` entry in `package.json` — enables `npx cloud-logging-mcp` for zero-install usage
- Shebang (`#!/usr/bin/env node`) to `src/main.ts` for direct binary execution

### Fixed
- `tsconfig.build.json` missing `rootDir` and `moduleResolution` caused several modules to be absent from `dist/` — `aggregate-logs`, `log-metrics`, `protobuf-decoder`, and `token-caching` were not compiled, making the npm package non-functional
- README installation section restructured: `npx` install is now the primary method with explicit Cursor and Claude Desktop configs

## [1.0.1] - 2026-05-06

### Added
- `aggregateLogs` now supports `resourceNames` parameter, enabling aggregation of organization-level audit logs (same as `queryLogs`)

### Fixed
- `queryLogs` `resourceNames` field description corrected — now documents `organizations/<orgId>` for org-level logs instead of a misleading log path example
- `queryLogs` `summaryFields` now warns that protobuf-encoded paths (`protoPayload.*`) are not expanded — use `getLogDetail` instead
- `queryLogs` description adds warning that `SEARCH()` combined with field filters requires `AND` to avoid silent empty results
- `getLogDetail` description warns that org-scoped log IDs (from `resourceNames` queries) are not findable by this tool

### Changed
- `queryLogs` and `aggregateLogs` `projectId` fields now guide agents to call `listProjects` when the project ID is unknown
- `queryLogs` and `aggregateLogs` descriptions include common `resource.type` values with filter examples (App Engine, Cloud Run, Cloud Function, GKE, Pub/Sub)
- `queryLogs` description documents log summary truncation and directs agents to `getLogDetail` for full content

## [1.0.0] - 2026-04-29

### Added
- **Protobuf Decoding**: Automatic decoding of AuditLog and other protobuf messages for human-readable output
- **Log Aggregation**: Time-series and count aggregations via `aggregateLogs` tool
- **Metrics Queries**: Cloud Monitoring metrics support via `queryLogMetrics` tool
- **HTTP Transport**: Smithery HTTP streaming support with STDIO backwards compatibility
- **HTTP Log Summaries**: Automatic extraction of HTTP request info (method, URL, status, latency) for access logs
- **Comprehensive Documentation**: SECURITY.md, RELEASING.md, CHANGELOG.md, LICENSE file, and updated CLAUDE.md
- Custom `resolvePath` for protobuf imports to resolve nested Google proto dependencies
- Test coverage for protobuf decoder to catch loading issues
- Comparison documentation with Google's official Cloud Logging MCP
- Author field in package.json

### Fixed
- `listProjects` `pageSize` parameter being ignored (now properly limits results)
- Protobuf payloads returned as raw Buffer byte arrays (now properly decoded)
- Invalid `pageToken` errors incorrectly marked as retryable
- Proto import resolution for nested Google proto dependencies
- JSON-stringified Buffer detection and conversion
- Doubled `google/` prefix in proto file paths preventing proto files from loading

### Changed
- Updated to TypeScript 6.0.3
- Updated to Vitest 4.1.5
- Updated to Zod 4.3.6 (with breaking changes fixed)
- Updated to ESLint 10.2.1
- Updated Smithery CLI to 4.11.0 and SDK to 4.3.0
- Updated all Google Cloud SDKs to latest versions
- Reduced security vulnerabilities from 30 to 10
- Removed `eslint-plugin-eslint-comments` (incompatible with ESLint 10)
- Removed `google-auth-library` override (no longer needed)
- LICENSE moved to dedicated file following GitHub best practices
- Updated CLAUDE.md with recent architectural improvements (HTTP transport, protobuf decoder, token caching)

### Security
- Addressed 20 moderate/high/critical security vulnerabilities in dependencies
- Updated protobufjs to fix critical arbitrary code execution vulnerability

## [0.1.0] - Initial Release

### Added
- Initial MCP server implementation for Google Cloud Logging
- `queryLogs` tool for searching and filtering logs
- `getLogDetail` tool for retrieving individual log entries
- `listProjects` tool for listing accessible GCP projects
- Token caching and connection pooling for performance
- Health check resource for system status verification
- Clean architecture pattern with adapter/domain/port separation
