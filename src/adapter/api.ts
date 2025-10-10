import { Logging } from "@google-cloud/logging";
import { ProjectsClient } from "@google-cloud/resource-manager";
import { GoogleAuth } from "google-auth-library";
import { existsSync } from "node:fs";
import https from "node:https";
import { ok, err, type Result } from "neverthrow";
import type { CloudLoggingApi, CloudLoggingQuery, RawLogEntry, LogSeverity } from "../domain/api";
import type { CloudLoggingError } from "../domain/api";
import type { ListProjectsInput, ListProjectsOutput, Project } from "../domain/list-projects";
import { createLogId } from "../domain/log-id";

export class GoogleCloudLoggingApiClient implements CloudLoggingApi {
  private logging: Logging;
  private projectsClient: ProjectsClient;
  private authClient: GoogleAuth | undefined;

  constructor() {
    // Initialize with explicit configuration to ensure credentials are picked up
    const projectId = process.env.GOOGLE_CLOUD_PROJECT;
    const home = process.env.HOME;
    
    // Try to load the ADC file and create appropriate credentials
    let authClient: GoogleAuth | undefined;
    
    if (home !== undefined) {
      const adcPath = `${home}/.config/gcloud/application_default_credentials.json`;
      
      if (existsSync(adcPath)) {
        try {
          // Use GoogleAuth with keyFile option to load ADC
          // This handles both service account and user credentials
          authClient = new GoogleAuth({
            keyFile: adcPath,
            scopes: [
              'https://www.googleapis.com/auth/cloud-platform',
              'https://www.googleapis.com/auth/logging.read',
            ],
          });
        } catch (error) {
          console.error('Failed to load ADC credentials:', error);
        }
      }
    }
    
    // Fallback to GoogleAuth with default credentials if we couldn't load from file
    if (authClient === undefined) {
      authClient = new GoogleAuth({
        scopes: [
          'https://www.googleapis.com/auth/cloud-platform',
          'https://www.googleapis.com/auth/logging.read',
        ],
      });
    }
    
    // Store the auth client for direct REST API calls
    this.authClient = authClient;
    
    // Pass the auth client to the Logging client
    this.logging = new Logging({
      projectId,
      auth: authClient,
    });
    this.projectsClient = new ProjectsClient({
      auth: authClient,
    });
  }

  async entries(params: CloudLoggingQuery): Promise<
    Result<
      {
        entries: RawLogEntry[];
        nextPageToken?: string;
      },
      CloudLoggingError
    >
  > {
    try {
      // Use direct REST API call instead of SDK to avoid authentication issues
      if (this.authClient !== undefined) {
        return await this.entriesDirectAPI(params);
      }
      
      // Fallback to SDK if authClient is not available
      interface GetEntriesRequest {
        projectIds: string[];
        filter: string;
        pageSize: number;
        pageToken?: string;
        orderBy: string;
        resourceNames?: string[];
      }

      const request: GetEntriesRequest = {
        projectIds: [params.projectId],
        filter: params.filter,
        pageSize: params.pageSize ?? 100,
        pageToken: params.pageToken,
        orderBy: params.orderBy !== undefined ? `timestamp ${params.orderBy.timestamp}` : "timestamp desc",
      };

      request.resourceNames = (params.resourceNames !== undefined && params.resourceNames.length > 0)
        ? params.resourceNames
        : request.resourceNames;

      const getEntriesResult = await this.logging.getEntries(request);
      const entries = getEntriesResult[0];
      const response = getEntriesResult[2];

      const rawEntries: RawLogEntry[] = entries.map((entry) => {
        const metadata: Record<string, unknown> = typeof entry.metadata === 'object' && entry.metadata !== null ? entry.metadata : {};
        const data: unknown = entry.data;

        const timestamp = this.extractTimestamp(metadata.timestamp)

        return {
          insertId: createLogId(typeof metadata.insertId === 'string' ? metadata.insertId : ""),
          timestamp,
          severity: this.mapSeverity(metadata.severity),
          jsonPayload: typeof data === "object" && data !== null && !Buffer.isBuffer(data) ? this.cloneObject(data) : undefined,
          textPayload: typeof data === "string" ? data : Buffer.isBuffer(data) ? data.toString() : undefined,
          protoPayload: this.convertProtoPayload(metadata.protoPayload),
          labels: metadata.labels,
          resource: metadata.resource,
          httpRequest: metadata.httpRequest,
          trace: metadata.trace,
          spanId: metadata.spanId,
          traceSampled: metadata.traceSampled,
          sourceLocation: metadata.sourceLocation,
          operation: metadata.operation,
        };
      });

      return ok({
        entries: rawEntries,
        nextPageToken: response?.nextPageToken ?? undefined,
      });
    } catch (error) {
      const errorObj = error instanceof Error ? error : { message: String(error) };
      const cloudError: CloudLoggingError = {
        message: errorObj.message ?? "Unknown error occurred",
        code: this.mapErrorCode('code' in errorObj && typeof errorObj.code === 'number' ? errorObj.code : undefined),
      };
      return err(cloudError);
    }
  }

  private async entriesDirectAPI(params: CloudLoggingQuery): Promise<
    Result<
      {
        entries: RawLogEntry[];
        nextPageToken?: string;
      },
      CloudLoggingError
    >
  > {
    try {
      if (this.authClient === undefined) {
        throw new Error('Auth client not available');
      }

      // Get access token from GoogleAuth
      const client = await this.authClient.getClient();
      const tokenResponse = await client.getAccessToken();
      const token = tokenResponse.token;
      
      if (token === null || token === undefined) {
        throw new Error('Failed to obtain access token');
      }

      // Prepare request body
      const requestBody: Record<string, unknown> = {
        projectIds: [params.projectId],
        filter: params.filter,
        pageSize: params.pageSize ?? 100,
        orderBy: params.orderBy !== undefined ? `timestamp ${params.orderBy.timestamp}` : "timestamp desc",
      };

      if (params.pageToken !== undefined) {
        requestBody.pageToken = params.pageToken;
      }

      if (params.resourceNames !== undefined && params.resourceNames.length > 0) {
        requestBody.resourceNames = params.resourceNames;
      }

      const postData = JSON.stringify(requestBody);

      // Make HTTPS request
      const response = await new Promise<{entries?: unknown[]; nextPageToken?: string}>((resolve, reject) => {
        const options = {
          hostname: 'logging.googleapis.com',
          path: '/v2/entries:list',
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData),
            'x-goog-user-project': params.projectId,
          },
        };

        const req = https.request(options, (res) => {
          let data = '';
          res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
          res.on('end', () => {
            if (res.statusCode === 200) {
              try {
                const parsed: unknown = JSON.parse(data);
                resolve(parsed as {entries?: unknown[]; nextPageToken?: string});
              } catch {
                reject(new Error('Failed to parse response'));
              }
            } else {
              reject(new Error(`HTTP ${res.statusCode ?? 'error'}: ${data}`));
            }
          });
        });

        req.on('error', reject);
        req.write(postData);
        req.end();
      });

      // Parse entries
      const rawEntries: RawLogEntry[] = (response.entries ?? []).map((entry: unknown) => {
        if (typeof entry !== 'object' || entry === null) {
          return this.createEmptyLogEntry();
        }

        const e = entry as Record<string, unknown>;
        const timestamp = this.extractTimestamp(e.timestamp);

        return {
          insertId: createLogId(typeof e.insertId === 'string' ? e.insertId : ""),
          timestamp,
          severity: this.mapSeverity(e.severity),
          jsonPayload: typeof e.jsonPayload === "object" && e.jsonPayload !== null ? this.cloneObject(e.jsonPayload) : undefined,
          textPayload: typeof e.textPayload === "string" ? e.textPayload : undefined,
          protoPayload: this.convertProtoPayload(e.protoPayload),
          labels: typeof e.labels === 'object' && e.labels !== null ? e.labels as Record<string, string> : undefined,
          resource: typeof e.resource === 'object' && e.resource !== null ? e.resource as Record<string, unknown> : undefined,
          httpRequest: typeof e.httpRequest === 'object' && e.httpRequest !== null ? e.httpRequest as Record<string, unknown> : undefined,
          trace: typeof e.trace === 'string' ? e.trace : undefined,
          spanId: typeof e.spanId === 'string' ? e.spanId : undefined,
          traceSampled: typeof e.traceSampled === 'boolean' ? e.traceSampled : undefined,
          sourceLocation: typeof e.sourceLocation === 'object' && e.sourceLocation !== null ? e.sourceLocation as Record<string, unknown> : undefined,
          operation: typeof e.operation === 'object' && e.operation !== null ? e.operation as Record<string, unknown> : undefined,
        };
      });

      return ok({
        entries: rawEntries,
        nextPageToken: response.nextPageToken,
      });
    } catch (error) {
      const errorObj = error instanceof Error ? error : { message: String(error) };
      const cloudError: CloudLoggingError = {
        message: errorObj.message ?? "Unknown error occurred",
        code: "INTERNAL",
      };
      return err(cloudError);
    }
  }

  private createEmptyLogEntry(): RawLogEntry {
    return {
      insertId: createLogId(""),
      timestamp: new Date().toISOString(),
      severity: "DEFAULT",
    };
  }

  private extractTimestamp(timestamp: unknown): string {
    if (timestamp === undefined || timestamp === null) {
      return new Date().toISOString();
    }
    
    if (typeof timestamp === 'string') {
      return timestamp;
    }
    
    if (timestamp instanceof Date) {
      return timestamp.toISOString();
    }
    
    if (typeof timestamp === 'object' && 'seconds' in timestamp) {
      // Handle Google protobuf Timestamp
      const seconds = timestamp.seconds;
      return (seconds !== undefined)
        ? new Date(Number(seconds) * 1000).toISOString()
        : new Date().toISOString();
    }
    
    return new Date().toISOString();
  }

  private mapSeverity(severity: unknown): LogSeverity {
    return (typeof severity !== 'string')
      ? "DEFAULT"
      : ((): LogSeverity => {
          switch (severity) {
            case "DEFAULT":
            case "DEBUG":
            case "INFO":
            case "NOTICE":
            case "WARNING":
            case "ERROR":
            case "CRITICAL":
            case "ALERT":
            case "EMERGENCY":
              return severity;
            default:
              return "DEFAULT";
          }
        })();
  }

  private convertProtoPayload(payload: unknown): Record<string, unknown> | undefined {
    return (payload === null || payload === undefined)
      ? undefined
      : (typeof payload === 'object')
        ? this.cloneObject(payload) // Convert protobuf object to plain object
        : undefined;
  }

  private cloneObject(obj: unknown): Record<string, unknown> | undefined {
    if (typeof obj !== 'object' || obj === null) {
      return undefined;
    }
    
    const str = JSON.stringify(obj);
    const parsed: unknown = JSON.parse(str);
    
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return undefined;
    }
    
    // Create a new object to ensure proper typing
    const result: Record<string, unknown> = {};
    for (const key in parsed) {
      if (Object.prototype.hasOwnProperty.call(parsed, key)) {
        result[key] = Object.getOwnPropertyDescriptor(parsed, key)?.value;
      }
    }
    return result;
  }

  private mapProjectState(state: unknown): Project["state"] {
    return (typeof state !== 'string')
      ? "ACTIVE"
      : ((): Project["state"] => {
          switch (state) {
            case "ACTIVE":
            case "DELETE_REQUESTED":
            case "DELETE_IN_PROGRESS":
              return state;
            default:
              return "ACTIVE";
          }
        })();
  }

  private mapErrorCode(code: number | undefined): CloudLoggingError["code"] {
    switch (code) {
      case 3:
        return "INVALID_ARGUMENT";
      case 5:
        return "NOT_FOUND";
      case 7:
        return "PERMISSION_DENIED";
      case 13:
        return "INTERNAL";
      case 14:
        return "UNAVAILABLE";
      case 16:
        return "UNAUTHENTICATED";
      case undefined:
        return "INTERNAL";
      default:
        return "INTERNAL";
    }
  }

  async listProjects(params: ListProjectsInput): Promise<ListProjectsOutput> {
    try {
      const [projects, , response] = await this.projectsClient.searchProjects({
        query: params.filter,
        pageSize: params.pageSize,
        pageToken: params.pageToken,
      });

      const mappedProjects: Project[] = projects.map((project) => ({
        projectId: project.projectId ?? "",
        name: project.name ?? "",
        displayName: project.displayName ?? undefined,
        state: this.mapProjectState(project.state),
        createTime: typeof project.createTime === 'string' ? project.createTime : new Date().toISOString(),
        updateTime: typeof project.updateTime === 'string' ? project.updateTime : undefined,
      }));

      return {
        projects: mappedProjects,
        nextPageToken: response?.nextPageToken ?? undefined,
      };
    } catch (error) {
      const errorObj = error instanceof Error ? error : { message: String(error) };
      throw new Error(`Failed to list projects: ${errorObj.message ?? 'Unknown error'}`);
    }
  }
}
