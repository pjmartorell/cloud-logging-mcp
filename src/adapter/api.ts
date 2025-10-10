import { Logging } from "@google-cloud/logging";
import { ProjectsClient } from "@google-cloud/resource-manager";
import { GoogleAuth } from "google-auth-library";
import grpc from "@grpc/grpc-js";
import { ok, err, type Result } from "neverthrow";
import type { CloudLoggingApi, CloudLoggingQuery, RawLogEntry, LogSeverity } from "../domain/api";
import type { CloudLoggingError } from "../domain/api";
import type { ListProjectsInput, ListProjectsOutput, Project } from "../domain/list-projects";
import { createLogId } from "../domain/log-id";

export class GoogleCloudLoggingApiClient implements CloudLoggingApi {
  private projectsClient: ProjectsClient;
  private auth: GoogleAuth;
  private projectId: string;

  constructor() {
    // Initialize with explicit configuration to ensure credentials are picked up
    this.projectId = process.env.GOOGLE_CLOUD_PROJECT ?? "";
    
    // Create GoogleAuth instance for obtaining access tokens
    // This is necessary for creating manual gRPC credentials that work with v10
    this.auth = new GoogleAuth({
      scopes: [
        'https://www.googleapis.com/auth/cloud-platform',
        'https://www.googleapis.com/auth/logging.read',
      ],
    });
    
    this.projectsClient = new ProjectsClient({
      projectId: this.projectId,
    });
  }
  
  /**
   * Initialize the Logging client with manual gRPC credentials.
   * This workaround is needed because google-auth-library v10 has issues
   * with gRPC authentication when using authorized_user credentials.
   */
  private async getLoggingClient(): Promise<Logging> {
    try {
      // Get auth client and access token
      const authClient = await this.auth.getClient();
      const tokenResponse = await authClient.getAccessToken();
      
      if (tokenResponse.token === null || tokenResponse.token === undefined) {
        throw new Error('Failed to obtain access token');
      }
      
      // Create gRPC credentials manually
      const sslCreds = grpc.credentials.combineChannelCredentials(
        grpc.credentials.createSsl(),
        grpc.credentials.createFromMetadataGenerator((_params, callback) => {
          const metadata = new grpc.Metadata();
          metadata.set('authorization', `Bearer ${tokenResponse.token}`);
          metadata.set('x-goog-user-project', this.projectId);
          callback(null, metadata);
        })
      );
      
      // Create logging client with manual gRPC credentials
      return new Logging({
        projectId: this.projectId,
        sslCreds,
      });
    } catch (error) {
      // Fallback to default initialization if manual credentials fail
      // This should rarely happen in production
      return new Logging({ projectId: this.projectId });
    }
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
      // Get logging client with proper gRPC credentials
      const logging = await this.getLoggingClient();
      
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

      const getEntriesResult = await logging.getEntries(request);
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
