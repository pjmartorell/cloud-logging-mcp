import { Logging } from "@google-cloud/logging";
import { ProjectsClient } from "@google-cloud/resource-manager";
import { MetricServiceClient } from "@google-cloud/monitoring";
import { GoogleAuth } from "google-auth-library";
import grpc from "@grpc/grpc-js";
import { ok, err, type Result } from "neverthrow";
import type { CloudLoggingApi, CloudLoggingQuery, RawLogEntry, LogSeverity } from "../domain/api";
import type { CloudLoggingError } from "../domain/api";
import type { ListProjectsInput, ListProjectsOutput, Project } from "../domain/list-projects";
import type { AggregationInput, AggregationOutput } from "../domain/aggregate-logs";
import type { LogMetricsInput, LogMetricsOutput, LogMetricsError } from "../domain/log-metrics";
import {
  buildAggregationFilter,
  groupLogEntries,
  formatGroupedResults,
  groupLogEntriesByTime,
  formatTimeSeriesResults,
  timeIntervalToSeconds,
} from "../domain/aggregate-logs";
import {
  validateMetricName,
  validateAlignmentPeriod,
  validateTimeRange,
} from "../domain/log-metrics";
import { createLogId } from "../domain/log-id";

export class GoogleCloudLoggingApiClient implements CloudLoggingApi {
  private projectsClient: ProjectsClient;
  private metricsClient: MetricServiceClient;
  private auth: GoogleAuth;
  private projectId: string;
  private cachedLoggingClient?: Logging;
  private tokenExpiryTime?: number;

  constructor() {
    // Initialize with explicit configuration to ensure credentials are picked up
    this.projectId = process.env.GOOGLE_CLOUD_PROJECT ?? "";
    
    // Create GoogleAuth instance for obtaining access tokens
    // This is necessary for creating manual gRPC credentials that work with v10
    this.auth = new GoogleAuth({
      scopes: [
        'https://www.googleapis.com/auth/cloud-platform',
        'https://www.googleapis.com/auth/logging.read',
        'https://www.googleapis.com/auth/monitoring.read',
      ],
    });
    
    this.projectsClient = new ProjectsClient({
      projectId: this.projectId,
    });

    this.metricsClient = new MetricServiceClient({
      projectId: this.projectId,
    });
  }
  
  /**
   * Safely extracts expiry_date from the auth token response
   * The auth library uses `any` types internally, so we need type-safe extraction
   */
  private extractExpiryDate(res: unknown): unknown {
    if (res === null || res === undefined || typeof res !== 'object') {
      return undefined;
    }
    
    const resWithData = res;
    if (!('data' in resWithData)) {
      return undefined;
    }
    
    const data = resWithData.data;
    if (data === null || data === undefined || typeof data !== 'object') {
      return undefined;
    }
    
    if (!('expiry_date' in data)) {
      return undefined;
    }
    
    return Object.getOwnPropertyDescriptor(data, 'expiry_date')?.value;
  }
  
  /**
   * Initialize the Logging client with manual gRPC credentials.
   * This workaround is needed because google-auth-library v10 has issues
   * with gRPC authentication when using authorized_user credentials.
   * 
   * The client and token are cached to reduce authentication overhead.
   * Tokens are refreshed automatically when they expire (typically after 1 hour).
   */
  private async getLoggingClient(): Promise<Logging> {
    const now = Date.now();
    
    // Return cached client if token hasn't expired yet
    // Add a 5-minute buffer before expiry to avoid race conditions
    if (
      this.cachedLoggingClient !== undefined && 
      this.tokenExpiryTime !== undefined && 
      now < (this.tokenExpiryTime - 5 * 60 * 1000)
    ) {
      return this.cachedLoggingClient;
    }
    
    try {
      // Get auth client and access token
      const authClient = await this.auth.getClient();
      const tokenResponse = await authClient.getAccessToken();
      
      if (tokenResponse.token === null || tokenResponse.token === undefined) {
        throw new Error('Failed to obtain access token');
      }
      
      // Calculate token expiry time
      // If res.expiry_date is available, use it; otherwise default to 1 hour
      // The res object is any type from the auth library, so we need to safely extract expiry_date
      const expiryDate: unknown = this.extractExpiryDate(tokenResponse.res);
      
      if (typeof expiryDate === 'number') {
        this.tokenExpiryTime = expiryDate;
      } else {
        // Default to 55 minutes from now (tokens typically last 1 hour)
        this.tokenExpiryTime = now + (55 * 60 * 1000);
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
      
      // Create and cache the logging client
      this.cachedLoggingClient = new Logging({
        projectId: this.projectId,
        sslCreds,
      });
      
      return this.cachedLoggingClient;
    } catch (error) {
      // Fallback to default initialization if manual credentials fail
      // This should rarely happen in production
      // Clear cache to retry on next attempt
      this.cachedLoggingClient = undefined;
      this.tokenExpiryTime = undefined;
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
      throw new Error(`Failed to list projects: ${errorObj.message ?? 'Unknown error'}`, {
        cause: error,
      });
    }
  }

  async queryLogMetrics(params: LogMetricsInput): Promise<Result<LogMetricsOutput, LogMetricsError>> {
    const startTime = Date.now();

    try {
      // Validate inputs
      const metricNameResult = validateMetricName(params.metricName);
      if (metricNameResult.isErr()) {
        return err({
          message: metricNameResult.error.message,
          code: "INVALID_ARGUMENT",
        });
      }

      const alignmentPeriodResult = validateAlignmentPeriod(params.alignmentPeriod);
      if (alignmentPeriodResult.isErr()) {
        return err({
          message: alignmentPeriodResult.error.message,
          code: "INVALID_ARGUMENT",
        });
      }

      const timeRangeResult = validateTimeRange(params.startTime, params.endTime);
      if (timeRangeResult.isErr()) {
        return err({
          message: timeRangeResult.error.message,
          code: "INVALID_ARGUMENT",
        });
      }

      const fullMetricName = metricNameResult.value;
      const projectName = `projects/${params.projectId}`;

      // Build the time series request
      const request = {
        name: projectName,
        filter: `metric.type="${fullMetricName}"`,
        interval: {
          startTime: {
            seconds: Math.floor(new Date(params.startTime).getTime() / 1000),
          },
          endTime: {
            seconds: Math.floor(new Date(params.endTime).getTime() / 1000),
          },
        },
        aggregation: alignmentPeriodResult.value !== undefined ? {
          alignmentPeriod: {
            seconds: Number.parseInt(alignmentPeriodResult.value.replace('s', ''), 10),
          },
          perSeriesAligner: this.mapAggregationType(params.aggregation),
        } : undefined,
      };

      // Query the metrics
      const [timeSeries] = await this.metricsClient.listTimeSeries(request);

      // Extract and format data points
      const points = timeSeries.flatMap(series => {
        const seriesPoints = series.points ?? [];
        return seriesPoints.map(point => {
          const timestamp = point.interval?.endTime?.seconds !== undefined
            ? new Date(Number(point.interval.endTime.seconds) * 1000).toISOString()
            : new Date().toISOString();

          const value = ((): number => {
            if (point.value?.doubleValue !== undefined && point.value.doubleValue !== null) {
              return point.value.doubleValue;
            }
            if (point.value?.int64Value !== undefined && point.value.int64Value !== null) {
              return typeof point.value.int64Value === 'string' 
                ? Number.parseInt(point.value.int64Value, 10)
                : Number(point.value.int64Value);
            }
            return 0;
          })();

          return { timestamp, value };
        });
      });

      // Sort by timestamp
      points.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

      const output: LogMetricsOutput = {
        metric: {
          name: params.metricName,
          type: fullMetricName,
          points,
        },
        metadata: {
          executionTimeMs: Date.now() - startTime,
          pointCount: points.length,
        },
      };

      return ok(output);
    } catch (error) {
      const errorObj = error instanceof Error ? error : { message: String(error) };
      const errorMessage = errorObj.message ?? "Unknown error occurred";

      // Map error codes
      const code: LogMetricsError["code"] = ((): LogMetricsError["code"] => {
        if (errorMessage.includes("NOT_FOUND") || errorMessage.includes("not found")) {
          return "NOT_FOUND";
        }
        if (errorMessage.includes("PERMISSION_DENIED") || errorMessage.includes("permission")) {
          return "PERMISSION_DENIED";
        }
        if (errorMessage.includes("INVALID_ARGUMENT") || errorMessage.includes("invalid")) {
          return "INVALID_ARGUMENT";
        }
        return "INTERNAL";
      })();

      return err({
        message: errorMessage,
        code,
      });
    }
  }

  private mapAggregationType(aggregation: string | undefined): number {
    // Map to Cloud Monitoring Aligner enum
    // ALIGN_NONE = 0, ALIGN_DELTA = 1, ALIGN_RATE = 2, ALIGN_SUM = 10, etc.
    switch (aggregation) {
      case "sum":
        return 10; // ALIGN_SUM
      case "count":
        return 11; // ALIGN_COUNT
      case "rate":
        return 2; // ALIGN_RATE
      case "distribution":
        return 0; // ALIGN_NONE (for distributions)
      case undefined:
        return 1; // ALIGN_DELTA (default for undefined)
      default:
        return 1; // ALIGN_DELTA (default for any other value)
    }
  }

  async aggregate(params: AggregationInput): Promise<Result<AggregationOutput, CloudLoggingError>> {
    try {
      // Build the complete filter
      const filterResult = buildAggregationFilter(params);
      if (filterResult.isErr()) {
        return err({
          message: `Invalid aggregation filter: ${filterResult.error.message}`,
          code: "INVALID_ARGUMENT",
        });
      }

      // Fetch all logs within the time range
      // Note: For large datasets, this could be optimized with pagination
      const entriesResult = await this.entries({
        projectId: params.projectId,
        filter: filterResult.value,
        pageSize: params.pageSize ?? 1000, // Default to larger page size for aggregation
        pageToken: params.pageToken,
        orderBy: { timestamp: "asc" },
      });

      if (entriesResult.isErr()) {
        return err(entriesResult.error);
      }

      const { entries, nextPageToken } = entriesResult.value;

      // Perform aggregation based on type
      const output: AggregationOutput = ((): AggregationOutput => {
        switch (params.aggregation.type) {
          case "count": {
            // Simple count of all entries
            return {
              aggregation: {
                type: "count",
                results: [{ count: entries.length }],
              },
              nextPageToken,
            };
          }

          case "group_by": {
            if (params.aggregation.groupBy === undefined || params.aggregation.groupBy.length === 0) {
              throw new Error("groupBy fields are required for group_by aggregation");
            }

            const groups = groupLogEntries(entries, params.aggregation.groupBy);
            const results = formatGroupedResults(groups);

            return {
              aggregation: {
                type: "group_by",
                results,
              },
              nextPageToken,
            };
          }

          case "time_series": {
            if (params.aggregation.timeInterval === undefined) {
              throw new Error("timeInterval is required for time_series aggregation");
            }

            const intervalSeconds = timeIntervalToSeconds(params.aggregation.timeInterval);
            const buckets = groupLogEntriesByTime(
              entries,
              intervalSeconds,
              params.startTime,
              params.endTime
            );
            const results = formatTimeSeriesResults(buckets);

            return {
              aggregation: {
                type: "time_series",
                results,
              },
              nextPageToken,
            };
          }
        }
      })();

      return ok(output);
    } catch (error) {
      const errorObj = error instanceof Error ? error : { message: String(error) };
      return err({
        message: errorObj.message ?? "Unknown error occurred",
        code: "INTERNAL",
      });
    }
  }
}
