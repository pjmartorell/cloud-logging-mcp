# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Comprehensive SECURITY.md with production deployment guidance
- RELEASING.md documenting the version management and release process
- Author field in package.json

### Changed
- LICENSE moved to dedicated file following GitHub best practices
- Updated CLAUDE.md with recent architectural improvements

## [1.0.0] - 2026-04-29

### Added
- **Protobuf Decoding**: Automatic decoding of AuditLog and other protobuf messages for human-readable output
- **Log Aggregation**: Time-series and count aggregations via `aggregateLogs` tool
- **Metrics Queries**: Cloud Monitoring metrics support via `queryLogMetrics` tool
- **HTTP Transport**: Smithery HTTP streaming support with STDIO backwards compatibility
- **HTTP Log Summaries**: Automatic extraction of HTTP request info (method, URL, status, latency) for access logs
- Custom `resolvePath` for protobuf imports to resolve nested Google proto dependencies
- Test coverage for protobuf decoder to catch loading issues
- Comparison documentation with Google's official Cloud Logging MCP

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
