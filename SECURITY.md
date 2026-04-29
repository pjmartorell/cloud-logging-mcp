# Security Policy

## Overview

This MCP server connects to Google Cloud Logging APIs and handles potentially sensitive log data. Please review this security policy before deploying in production.

## Reporting Security Vulnerabilities

If you discover a security vulnerability in this project, please report it privately:

1. **Do NOT** create a public GitHub issue
2. Use GitHub's [private vulnerability reporting](https://github.com/pjmartorell/cloud-logging-mcp/security/advisories/new)
3. Or contact [@pjmartorell](https://github.com/pjmartorell) directly via GitHub

We aim to respond within 48 hours and will coordinate disclosure timing with you.

## Security Considerations

### Authentication & Credentials

**Google Cloud Authentication:**
- This server requires Google Cloud credentials to access Logging APIs
- Supports Application Default Credentials (ADC) or Service Account keys
- **Never** commit credentials to version control
- **Never** expose `GOOGLE_APPLICATION_CREDENTIALS` in logs or error messages

**Recommended practices:**
- Use ADC with `gcloud auth application-default login` for development
- Use Service Account keys with minimal IAM permissions for production
- Rotate service account keys regularly
- Use Workload Identity when running in GKE/Cloud Run

**Required IAM Permissions:**
```
logging.logEntries.list       # For queryLogs, getLogDetail
logging.logs.list             # For queryLogs
logging.logMetrics.list       # For queryLogMetrics
monitoring.timeSeries.list    # For queryLogMetrics
resourcemanager.projects.list # For listProjects
```

Grant only the minimum required permissions for your use case.

### Data Sensitivity

**Log Data:**
- Cloud logs may contain sensitive information (PII, secrets, internal IPs, etc.)
- Audit logs reveal user actions and system events
- **Never** cache log data to disk without encryption
- **Never** log full log entries in debug output

**In-Memory Cache:**
- This server uses an in-memory LRU cache for log entries (TTL: 5 minutes)
- Cache is cleared on server restart
- Consider disabling cache (`DISABLE_CACHE=1`) when handling highly sensitive logs

**Protobuf Payloads:**
- Audit log `protoPayload` fields are automatically decoded
- Decoded payloads may expose sensitive system operations
- Review audit log content before exposing to clients

### Transport Security

**HTTP Transport (default):**
- Uses Smithery's HTTP transport
- **Always** deploy behind HTTPS in production
- Consider authentication middleware (OAuth2, API keys)
- Consider rate limiting to prevent abuse

**STDIO Transport:**
- More secure for local development (no network exposure)
- Used by Claude Desktop and other MCP clients
- No authentication required (client has direct process control)

### Network Security

**Outbound Connections:**
- Connects to `logging.googleapis.com` (443)
- Connects to `monitoring.googleapis.com` (443)
- Connects to `cloudresourcemanager.googleapis.com` (443)
- All connections use TLS 1.2+

**Firewall Rules:**
- Allow outbound HTTPS (443) to `*.googleapis.com`
- For HTTP transport: restrict inbound access to trusted clients only

### Known Security Considerations

**Dependency Vulnerabilities:**
- Run `npm audit` regularly to check for known vulnerabilities
- Update dependencies promptly when security patches are released
- See `CHANGELOG.md` for security-related updates

**gRPC Authentication:**
- This project includes a workaround for `google-auth-library@10.x` gRPC authentication
- See `.cursorrules` "Known Issues" section for details
- The workaround manually sets authorization headers via `@grpc/grpc-js`

**Input Validation:**
- All tool inputs are validated with Zod schemas
- Filter parameters are passed directly to Google Cloud APIs
- Malformed filters may expose underlying API error messages

**Error Messages:**
- Error messages may reveal project IDs and resource names
- Consider sanitizing errors before exposing to untrusted clients

## Deployment Best Practices

### Production Checklist

- [ ] Use dedicated service account with minimal IAM permissions
- [ ] Enable audit logging for the service account
- [ ] Deploy behind HTTPS with valid TLS certificate
- [ ] Implement authentication (OAuth2, API keys, mTLS)
- [ ] Set up rate limiting and request throttling
- [ ] Monitor for unusual access patterns
- [ ] Rotate service account keys every 90 days
- [ ] Review logs regularly for security events
- [ ] Keep dependencies updated (`npm audit`, `npm update`)
- [ ] Set `NODE_ENV=production` to disable debug features

### Monitoring

**Security Events to Monitor:**
- Failed authentication attempts (401/403 errors)
- Unusual query patterns (large date ranges, excessive pagination)
- Access to sensitive projects or log types
- API rate limit violations
- Unexpected error rates

**Google Cloud Audit Logs:**
- Enable Data Access audit logs for the service account
- Monitor `logging.logEntries.list` calls
- Alert on access to sensitive log types

## Secure Configuration Examples

### Minimal Service Account IAM Policy

```json
{
  "bindings": [
    {
      "role": "roles/logging.viewer",
      "members": ["serviceAccount:mcp-logger@project.iam.gserviceaccount.com"]
    },
    {
      "role": "roles/monitoring.viewer",
      "members": ["serviceAccount:mcp-logger@project.iam.gserviceaccount.com"],
      "condition": {
        "title": "Only log metrics",
        "expression": "resource.type == 'logging.googleapis.com/LogMetric'"
      }
    }
  ]
}
```

### Environment Variables (Production)

```bash
# Required
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account-key.json

# Optional security settings
NODE_ENV=production
DISABLE_CACHE=1  # Disable in-memory log cache
LOG_LEVEL=error  # Minimize logging
```

## Support

For security questions or concerns that are not vulnerabilities, please:
- Open a GitHub Discussion
- Review existing issues and documentation first
- Check Google Cloud's [Security Best Practices](https://cloud.google.com/docs/security/best-practices)

## Acknowledgments

We appreciate responsible disclosure and will acknowledge security researchers who report valid vulnerabilities (with permission).

---

**Last Updated:** April 2026  
**Version:** 1.0.0
