# Google Cloud Logging MCP Server

A Model Context Protocol (MCP) server that provides comprehensive access to Google Cloud Logging. This server allows AI assistants to query, search, analyze, and aggregate logs from Google Cloud Platform projects with full protobuf decoding support.

## Features

- **Query Logs**: Search and filter logs across GCP projects with advanced filtering
- **Aggregate Logs**: Perform time-series and statistical aggregations on log data
- **Query Metrics**: Fetch Cloud Monitoring metrics for log-based analysis  
- **Get Log Details**: Retrieve complete details for specific log entries with decoded protobuf payloads
- **List Projects**: List and filter accessible GCP projects with pagination
- **Protobuf Decoding**: Automatic decoding of AuditLog and other protobuf messages for readable output
- **HTTP Transport**: Streamable HTTP support via Smithery with STDIO backwards compatibility

## Comparison with Official Google Cloud Logging MCP

<details>
<summary><strong>How does this compare to Google's official MCP?</strong></summary>

Google Cloud provides an [official Cloud Logging MCP server](https://docs.cloud.google.com/logging/docs/reference/v2_mcp/mcp) at `https://logging.googleapis.com/mcp`. Both servers provide access to Google Cloud Logging, but they serve different use cases and have complementary strengths.

### Core Functionality

Both MCP servers provide the fundamental capability to query and retrieve log entries from Google Cloud Logging with filtering, pagination, and time range support.

### Key Differences

#### Analysis & Developer Experience (This MCP)

This server is optimized for **log analysis, debugging, and monitoring workflows**:

| Feature | This MCP | Google Official MCP |
|---------|----------|---------------------|
| **Protobuf Decoding** | ✅ Automatic decoding of AuditLog and other protobuf messages | ❌ Returns raw Buffer byte arrays |
| **Log Aggregations** | ✅ Time-series and count aggregations via `aggregateLogs` | ❌ Not available |
| **Metrics Integration** | ✅ Query Cloud Monitoring metrics via `queryLogMetrics` | ❌ Not available |
| **HTTP Request Summaries** | ✅ Auto-extracts and formats HTTP request info (method, URL, status, latency) | ❌ Raw httpRequest objects |
| **Custom Summary Fields** | ✅ Specify which fields to include in summaries | ❌ Full logs only |
| **Single Log Lookup** | ✅ Get individual log by ID via `getLogDetail` | ❌ Must query with filters |
| **Project Discovery** | ✅ List and filter accessible projects | ❌ Not available |
| **Multi-Project Support** | ✅ Query across multiple projects | ⚠️ Single project only per query |
| **Deployment Flexibility** | ✅ Self-hosted (STDIO or HTTP via Smithery) | ❌ Google-hosted endpoint only |

#### Infrastructure Management (Google Official MCP)

Google's official MCP excels at **log infrastructure and configuration management**:

| Feature | Google Official MCP | This MCP |
|---------|---------------------|----------|
| **Bucket Management** | ✅ Get and list log buckets | ❌ Not available |
| **View Management** | ✅ Get and list log bucket views (IAM/access control) | ❌ Not available |
| **Log Name Discovery** | ✅ List available log names in a project | ❌ Not available |
| **Managed Hosting** | ✅ Fully managed cloud endpoint with enterprise support | ⚠️ Self-hosted |

### Use Case Recommendations

**Use this MCP when you need to:**
- Debug applications and investigate errors with decoded AuditLog messages
- Perform time-series analysis and aggregations on log data
- Correlate logs with Cloud Monitoring metrics
- Build dashboards or reports from log data
- Work with HTTP access logs (Cloud Run, App Engine, Load Balancers)
- Run locally during development or in air-gapped environments
- Query logs across multiple projects

**Use Google's official MCP when you need to:**
- Manage log bucket configurations and retention policies
- Set up or modify log views for access control
- Discover available log names in a project
- Leverage Google Cloud's managed infrastructure and enterprise support

### Complementary Approach

Both MCPs can be used together to cover the full spectrum of logging needs:
- **This MCP**: Daily log analysis, debugging, monitoring, and metrics
- **Google Official MCP**: Log infrastructure setup, bucket/view management, and discovery

The automatic protobuf decoding in this MCP is particularly valuable for audit logs, which are commonly returned as unreadable byte arrays in raw API responses.

</details>

## Getting Started

### Prerequisites

- Node.js (v18+)
- npm (comes with Node.js)
- Google Cloud credentials configured
- Access to Google Cloud Logging API

### Quick Start with Smithery (Recommended)

[Smithery.ai](https://smithery.ai) provides the easiest way to deploy and use this MCP server:

1. **Deploy to Smithery:**
   - Visit [smithery.ai](https://smithery.ai)
   - Click "Deploy" and connect your GitHub repository
   - Configure your Google Cloud credentials in the Smithery dashboard
   - Your server will be automatically deployed with built-in authentication

2. **Test Locally with Smithery:**
   ```bash
   npm run dev
   ```
   This will start the server and port-forward it to the Smithery Playground via ngrok.

### Local Development

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Set up Google Cloud credentials:**
   ```bash
   # Option 1: Use gcloud CLI (recommended for local development)
   gcloud auth application-default login
   
   # Option 2: Use service account
   export GOOGLE_APPLICATION_CREDENTIALS="/path/to/service-account.json"
   ```

3. **Set your project ID:**
   ```bash
   export GOOGLE_CLOUD_PROJECT="your-project-id"
   ```

4. **Run the server:**
   ```bash
   npm start
   # Or for local development with watch mode:
   npm run dev:local
   ```

### Using with Claude Desktop

Add the following to your Claude Desktop configuration file:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "cloud-logging": {
      "command": "npx",
      "args": ["tsx", "/path/to/cloud-logging-mcp/src/main.ts"],
      "env": {
        "GOOGLE_CLOUD_PROJECT": "your-project-id"
      }
    }
  }
}
```

## Example Tool Usage

### Query Logs

Search and filter logs from Google Cloud Logging.

```json
{
  "tool": "queryLogs",
  "input": {
    "projectId": "my-project",
    "filter": "resource.type=\"cloud_run_revision\" AND severity>=ERROR",
    "orderBy": {
      "timestamp": "desc"
    },
    "pageSize": 50
  }
}
```

Parameters:
- `projectId`: GCP project ID
- `filter`: Log filter query (follows GCP logging query syntax)
- `orderBy`: Sort order for results
- `pageSize`: Number of results per page
- `pageToken`: Token for pagination
- `resourceNames`: Specific log resources to query
- `summaryFields`: Fields to include in the summary

### Get Log Detail

Retrieve complete details for a specific log entry.

```json
{
  "tool": "getLogDetail",
  "input": {
    "projectId": "my-project",
    "logId": "65f5a7b60000000001234567"
  }
}
```

Parameters:
- `projectId`: GCP project ID
- `logId`: The unique identifier of the log entry

### List Projects

List all accessible Google Cloud projects with optional filtering and pagination.

```json
{
  "tool": "listProjects",
  "input": {
    "filter": "projectId:my-*",
    "pageSize": 10,
    "pageToken": "optional-token-from-previous-response"
  }
}
```

Parameters:
- `filter` (optional): Filter expression (e.g., `projectId:my-*`)
- `pageSize` (optional): Number of projects to return (default: 100)
- `pageToken` (optional): Token for pagination

### Aggregate Logs

Perform time-series aggregations or statistical analysis on logs.

```json
{
  "tool": "aggregateLogs",
  "input": {
    "projectId": "my-project",
    "filter": "resource.type=\"cloud_run_revision\" AND severity>=ERROR",
    "startTime": "2024-01-01T00:00:00Z",
    "endTime": "2024-01-01T23:59:59Z",
    "aggregationType": "time_series",
    "interval": "1h"
  }
}
```

Parameters:
- `projectId`: GCP project ID
- `filter`: Log filter query
- `startTime`: Start time in ISO 8601 format
- `endTime`: End time in ISO 8601 format  
- `aggregationType`: `"time_series"` or `"count"`
- `interval` (for time_series): `"1m"`, `"5m"`, `"1h"`, `"1d"`

### Query Log Metrics

Fetch Cloud Monitoring metrics for log-based analysis.

```json
{
  "tool": "queryLogMetrics",
  "input": {
    "projectId": "my-project",
    "metricName": "logging.googleapis.com/user/my_custom_metric",
    "startTime": "2024-01-01T00:00:00Z",
    "endTime": "2024-01-01T23:59:59Z",
    "alignmentPeriod": "300s",
    "perSeriesAligner": "ALIGN_RATE"
  }
}
```

Parameters:
- `projectId`: GCP project ID
- `metricName`: Metric name (e.g., `logging.googleapis.com/user/metric_name`)
- `startTime`: Start time in ISO 8601 format
- `endTime`: End time in ISO 8601 format
- `alignmentPeriod`: Alignment period (e.g., `"60s"`, `"300s"`, `"3600s"`)
- `perSeriesAligner` (optional): Aligner type (e.g., `"ALIGN_RATE"`, `"ALIGN_SUM"`, `"ALIGN_MEAN"`)

## Common Filter Examples

For detailed release notes and version history, see [CHANGELOG.md](CHANGELOG.md).

- **By severity:** `severity>=ERROR`
- **By time range:** `timestamp>="2024-01-01T00:00:00Z"`
- **By resource:** `resource.type="cloud_run_revision"`
- **By text search:** `textPayload:"connection timeout"`
- **Combined:** `resource.type="k8s_container" AND severity=ERROR AND timestamp>="2024-01-01T00:00:00Z"`

## Debugging

Enable detailed authentication and API call logs by setting the `NODE_DEBUG` environment variable:

```bash
# Enable debug logging for google-auth-library
NODE_DEBUG=google-auth npm start

# Enable debug logging for all Google libraries
NODE_DEBUG=google-* npm start

# In Claude Desktop config
{
  "mcpServers": {
    "cloud-logging": {
      "command": "npx",
      "args": ["tsx", "/path/to/cloud-logging-mcp/src/main.ts"],
      "env": {
        "GOOGLE_CLOUD_PROJECT": "your-project-id",
        "NODE_DEBUG": "google-auth"
      }
    }
  }
}
```

You can also use the health check resource to verify system status:
- The server exposes a `health://status` resource that checks environment configuration, authentication, and API connectivity

## Configuration

### Smithery Configuration

When deploying to [Smithery.ai](https://smithery.ai), you can configure the server through the dashboard. The server accepts the following configuration options:

- **projectId** (optional): Google Cloud Project ID
- **debug** (optional): Enable debug logging for troubleshooting
- **credentials** (optional): Google Cloud service account credentials
  - Provide as JSON key file path, or
  - Provide client email and private key directly

See `smithery.yaml` for the complete configuration schema.

### Environment Variables

For local development or Claude Desktop usage:

- `GOOGLE_CLOUD_PROJECT`: Your Google Cloud project ID
- `GOOGLE_APPLICATION_CREDENTIALS`: Path to service account JSON key file (optional)
- `DEBUG`: Set to `"true"` to enable debug logging
- `NODE_DEBUG`: Set to `"google-auth"` for authentication debugging

## Troubleshooting

1. **Authentication errors:** Ensure your Google Cloud credentials are properly configured
   - Run `gcloud auth application-default login` to set up credentials
   - Verify credentials exist at `~/.config/gcloud/application_default_credentials.json`
   - Check the health status resource for detailed diagnostics
2. **Permission errors:** Check that your account has the required permissions
   - Required IAM role: `roles/logging.viewer` or equivalent for logs
   - Required IAM role: `roles/monitoring.viewer` for metrics queries
   - Verify with: `gcloud projects get-iam-policy YOUR_PROJECT --flatten="bindings[].members" --filter="bindings.members:user:YOUR_EMAIL"`
3. **No results:** Verify your filter syntax and that logs exist for your query
   - Test your filter with `gcloud logging read` first
   - Check the time range in your query (use ISO 8601 format)
4. **Invalid pageToken:** Page tokens expire and cannot be reused across different queries
   - Page tokens are tied to specific filter/sort combinations
   - Don't retry with the same invalid token (error is not retryable)
5. **Protobuf decoding errors:** The server automatically decodes Google Cloud AuditLog messages
   - Unknown protobuf types will return an error but won't crash the server
   - Check logs for "Unknown protobuf type" or "Failed to load proto" messages
6. **Performance:** The server implements token caching and connection pooling
   - Tokens are cached for ~55 minutes and automatically refreshed
   - Proto files are cached after first load for faster subsequent decodes

## Development

```bash
# Run tests (unit tests only, E2E tests skipped)
npm test

# Run all tests including E2E (requires Google Cloud credentials)
npm run test:all

# Run checks (typecheck, lint, test, knip)
npm run check

# Run all checks including E2E tests
npm run check:all

# Type checking
npm run typecheck

# Linting
npm run lint

# Format code
npm run format

# Start dev server with Smithery (port-forwards to playground)
npm run dev

# Start local dev server with watch mode
npm run dev:local

# Build for production
npm run build

# Clean build artifacts
npm run clean
```

**Note**: E2E tests (`test:all`, `check:all`) require valid Google Cloud credentials and will attempt to connect to actual Google Cloud services. Unit tests can run without credentials.

### Production Build

To build the project for production:

```bash
npm run build
```

This will compile TypeScript to JavaScript and output to the `dist/` directory with:
- Compiled JavaScript files
- TypeScript declaration files (`.d.ts`)
- Source maps for debugging

The built files can be run directly with Node.js:

```bash
node dist/main.js
```

## Architecture

The server follows a clean architecture pattern:

- **`/adapter`**: External service integrations (Google Cloud APIs, protobuf decoding)
- **`/domain`**: Core business logic and data models (log processing, aggregation, metrics)
- **`/port`**: Interface definitions and MCP tool handlers (input validation, response formatting)
- **`/util`**: Utility functions and helpers (redaction, health checks, protobuf decoder)

### Key Components

- **Protobuf Decoder** (`util/protobuf-decoder.ts`): Automatically decodes Google Cloud protobuf messages (AuditLog, Status, etc.) using `protobufjs` and `google-proto-files`
- **API Adapter** (`adapter/api.ts`): Type-safe Google Cloud API client with error mapping and protobuf payload decoding
- **Token Caching** (`adapter/token-caching.ts`): Caches authentication tokens with 5-minute buffer before expiry
- **Log Entry Processing** (`domain/log-entry.ts`): Extracts summaries with HTTP request fallbacks and sensitive data redaction

## License

MIT