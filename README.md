# Google Cloud Logging MCP Server

A Model Context Protocol (MCP) server that provides access to Google Cloud Logging. This server allows AI assistants to query, search, and analyze logs from Google Cloud Platform projects.

## Features

- **Query Logs**: Search and filter logs across GCP projects
- **Get Log Details**: Retrieve detailed information about specific log entries
- **List Projects**: List available GCP projects

## Getting Started

### Prerequisites

- Node.js (v18+) or [Bun](https://bun.sh/) runtime
- npm (comes with Node.js) or bun
- Google Cloud credentials configured
- Access to Google Cloud Logging API

### Quick Start

1. **Install dependencies:**
   ```bash
   npm install
   # or
   bun install
   ```

2. **Set up Google Cloud credentials:**
   ```bash
   # Option 1: Use gcloud CLI
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
   # or
   bun run start
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

**Note**: If using Bun, use:
```json
{
  "mcpServers": {
    "cloud-logging": {
      "command": "bun",
      "args": ["run", "/path/to/cloud-logging-mcp/src/main.ts"],
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

List all accessible Google Cloud projects.

```json
{
  "tool": "listProjects",
  "input": {}
}
```

Parameters: None

## Common Filter Examples

- **By severity:** `severity>=ERROR`
- **By time range:** `timestamp>="2024-01-01T00:00:00Z"`
- **By resource:** `resource.type="cloud_run_revision"`
- **By text search:** `textPayload:"connection timeout"`
- **Combined:** `resource.type="k8s_container" AND severity=ERROR AND timestamp>="2024-01-01T00:00:00Z"`

## Troubleshooting

1. **Authentication errors:** Ensure your Google Cloud credentials are properly configured
2. **Permission errors:** Check that your account has the `logging.logEntries.list` permission
3. **No results:** Verify your filter syntax and that logs exist for your query
4. **Deprecation warnings:** You may see warnings about `fromStream` and `fromJSON` methods being deprecated. These are from the Google Cloud SDK's internal authentication library and do not affect functionality. They will be resolved when Google updates their SDKs

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

# Start dev server with watch mode
npm run dev
```

**Note**: E2E tests (`test:all`, `check:all`) require valid Google Cloud credentials and will attempt to connect to actual Google Cloud services. Unit tests can run without credentials.

## Architecture

The server follows a clean architecture pattern:

- **`/adapter`**: External service integrations (Google Cloud APIs)
- **`/domain`**: Core business logic and data models
- **`/port`**: Interface definitions and MCP tool handlers
- **`/util`**: Utility functions and helpers

## License

MIT