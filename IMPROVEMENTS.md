# Cloud Logging MCP — Improvements & Fixes

Derived from an audit of 36 Cursor agent transcripts (149 tool calls). The **retry rate is 62%** — most tool calls required a follow-up with different parameters because the agent had wrong assumptions. The fixes below are mostly documentation/schema improvements, not logic changes.

---

## Active Issues (needs fixing)

### 1. `queryLogs` — document known project IDs in `projectId` description

**Impact:** 92 occurrences of retry/adjustment. Most common failure: agent queries the wrong GCP project, gets zero results, then calls `listProjects` to discover the right one.

**Fix:** Add a known-projects mapping to the `projectId` field description in `tools/queryLogs.json` and `tools/aggregateLogs.json`:

```json
"projectId": {
  "type": "string",
  "description": "Google Cloud project ID. Known projects:\n  - senor-1099: staging App Engine (management-api, streaming-api)\n  - loyalguru-1029: production App Engine\n  - streaming-west: production Cloud Run services (management-api-apps, tickets-delete-datastore, pb-consumer) and Pub/Sub\n  For org-level audit logs, use any project you have access to and pass resourceNames: ['organizations/<orgId>']"
}
```

---

### 2. `queryLogs` — document `resourceNames` for org-level logs

**Impact:** 12 occurrences. Agents don't know that `resourceNames: ["organizations/<orgId>"]` is the only way to query org-level audit logs (e.g. org policy changes). The capability exists but is completely undocumented.

**Fix:** Update the `resourceNames` field description in `tools/queryLogs.json`:

```json
"resourceNames": {
  "type": "array",
  "items": { "type": "string" },
  "description": "Scope the query to specific resources instead of the full project. Use 'organizations/<orgId>' to query organization-level audit logs (e.g. org policy changes, custom constraints). Example: ['organizations/451305654306']. Note: projectId is still required as the billing/auth anchor even when resourceNames is set."
}
```

Also add to the top-level `queryLogs` description:

> **Org-level logs:** To query organization audit logs (org policies, IAM changes), pass `resourceNames: ["organizations/<orgId>"]` along with any valid `projectId`. These logs are not accessible at project scope.

---

### 3. `getLogDetail` — caveat for org-level log IDs

**Impact:** Tied to issue #2. When an agent retrieves org-level logs via `queryLogs` with `resourceNames`, the resulting log IDs are org-scoped. Calling `getLogDetail` with those IDs fails because it uses `projectId` as the lookup anchor.

**Fix:** Add a note to the `getLogDetail` description in `tools/getLogDetail.json`:

```json
"description": "Returns the full decoded record of a single log entry by its ID. Only works for project-level log IDs. If you retrieved a log entry via queryLogs with resourceNames=['organizations/...'], those log IDs are org-scoped and this tool will not find them — use queryLogs with summaryFields instead to read those fields."
```

---

### 4. `queryLogs` — document `summaryFields` limitations with protobuf

**Impact:** 6 occurrences. Agents request `protoPayload.methodName` or `protoPayload.authenticationInfo.principalEmail` via `summaryFields` expecting them to be returned, but only `timestamp` comes back. Protobuf-encoded paths are not expanded by `summaryFields`.

**Fix:** Update the `summaryFields` field description in `tools/queryLogs.json`:

```json
"summaryFields": {
  "type": "array",
  "items": { "type": "string" },
  "description": "Fields to include in the per-entry summary. Works for plain JSON fields: textPayload, jsonPayload.*, httpRequest.*, labels.*, resource.labels.*. Does NOT expand protobuf-encoded paths (e.g. protoPayload.methodName, protoPayload.authenticationInfo.*) — use getLogDetail to read the full decoded content of those entries."
}
```

---

### 5. `aggregateLogs` — document that `resourceNames` is not supported

**Impact:** 3 occurrences. Agents copy the `resourceNames` pattern from `queryLogs` and pass it to `aggregateLogs`. It is silently ignored, scoping to the full project.

**Fix (option A):** Add `resourceNames` to `aggregateLogs` schema (same as `queryLogs`).

**Fix (option B):** Document the limitation in `tools/aggregateLogs.json` description:

> **Note:** Unlike `queryLogs`, `aggregateLogs` always scopes to the full project. It does not support `resourceNames`. To aggregate org-level logs, use `queryLogs` with `summaryFields` instead.

---

### 6. `queryLogs` — document log content truncation and when to use `getLogDetail`

**Impact:** 5 occurrences. Log entries with very long `textPayload` (e.g. SQL queries in BQ job logs) are truncated in the summary, forcing agents to call `getLogDetail` for the full content.

**Fix:** Add to the `queryLogs` description:

> Log summaries are truncated for long payloads. To read the full content of a specific log entry, call `getLogDetail` with the entry's `id` field.

---

### 7. `queryLogs` — add common `resource.type` values to description

**Impact:** Many retries caused by agents guessing wrong `resource.type` or `module_id` values.

**Fix:** Add to the `queryLogs` description's EXAMPLES section:

```
- App Engine service: resource.type="gae_app" AND resource.labels.module_id="management-api-apps"
- Cloud Run service: resource.type="cloud_run_revision" AND resource.labels.service_name="my-service"
- Pub/Sub subscription: resource.type="pubsub_subscription"
- GKE container: resource.type="k8s_container" AND resource.labels.namespace_name="prod"
- Cloud Function: resource.type="cloud_function" AND resource.labels.function_name="my-fn"
```

---

## Fixed Issues (already resolved in April 2026)

| Bug | What happened | Fix |
|-----|---------------|-----|
| Protobuf payloads returned as raw `Buffer` | `protoPayload` and `jsonPayload` in `getLogDetail` and `queryLogs` returned as raw byte arrays | Added protobuf decoder ✓ |
| `listProjects` `pageSize` ignored | `pageSize: 5` returned hundreds of projects | Result now sliced to `pageSize` ✓ |
| HTTP access logs produced empty summaries | Cloud Run HTTP logs had no `textPayload`/`jsonPayload`, summary was `""` | Summary now renders `"METHOD url → status"` ✓ |
| Invalid `pageToken` missing `retryable: false` | Error response inconsistency | `retryable: false` now set on invalid page token ✓ |

---

## Appendix: Useful filter patterns (for README or tool descriptions)

| Use case | projectId | filter |
|----------|-----------|--------|
| Staging App Engine errors | `senor-1099` | `resource.type="gae_app" AND severity>=ERROR` |
| Prod management API errors | `streaming-west` | `resource.labels.module_id="management-api-apps" AND severity>=ERROR` |
| Cloud Run service logs | `streaming-west` | `resource.type="cloud_run_revision" AND resource.labels.service_name="my-service"` |
| Full-text search | any | `SEARCH("error message")` |
| Pub/Sub subscription audit | `streaming-west` | `SEARCH("my-subscription-name") AND logName:"cloudaudit.googleapis.com"` |
| Org policy changes | any + `resourceNames: ["organizations/451305654306"]` | `protoPayload.serviceName="orgpolicy.googleapis.com"` |

> **Note on SEARCH() + field filters:** Always join `SEARCH()` with field conditions using `AND`. Example: `resource.type="gae_app" AND SEARCH("timeout")`. Without `AND`, the filter may silently return no results.
