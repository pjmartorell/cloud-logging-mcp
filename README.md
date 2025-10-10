# Google Cloud Logging MCP Server

A Model Context Protocol (MCP) server that provides access to Google Cloud Logging. This server allows AI assistants to query, search, and analyze logs from Google Cloud Platform projects.

## Features

- **Query Logs**: Search and filter logs across GCP projects
- **Get Log Details**: Retrieve detailed information about specific log entries
- **List Projects**: List available GCP projects

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
2. **Permission errors:** Check that your account has the `logging.logEntries.list` permission
   - Required IAM role: `roles/logging.viewer` or equivalent
   - Verify with: `gcloud projects get-iam-policy YOUR_PROJECT --flatten="bindings[].members" --filter="bindings.members:user:YOUR_EMAIL"`
3. **No results:** Verify your filter syntax and that logs exist for your query
   - Test your filter with `gcloud logging read` first
   - Check the time range in your query
4. **Deprecation warnings:** You may see warnings about `fromStream` and `fromJSON` methods being deprecated. These are from the Google Cloud SDK's internal authentication library and do not affect functionality. They will be resolved when Google updates their SDKs
5. **Performance:** The server implements token caching and connection pooling to optimize performance. Tokens are cached for ~55 minutes and automatically refreshed when needed

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

- **`/adapter`**: External service integrations (Google Cloud APIs)
- **`/domain`**: Core business logic and data models
- **`/port`**: Interface definitions and MCP tool handlers
- **`/util`**: Utility functions and helpers

## License

MIT