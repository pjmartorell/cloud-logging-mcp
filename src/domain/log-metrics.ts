import { ok, err, type Result } from "neverthrow";

/**
 * Aggregation types for metrics
 */
type MetricAggregation = "sum" | "count" | "rate" | "distribution";

/**
 * Input for querying log-based metrics
 */
export interface LogMetricsInput {
  projectId: string;
  metricName: string;
  startTime: string; // ISO 8601
  endTime: string; // ISO 8601
  aggregation?: MetricAggregation;
  alignmentPeriod?: string; // e.g., "60s", "300s"
}

/**
 * A single data point in the metric time series
 */
interface MetricPoint {
  timestamp: string;
  value: number;
}

/**
 * Output from log metrics query
 */
export interface LogMetricsOutput {
  metric: {
    name: string;
    type: string;
    points: MetricPoint[];
  };
  metadata: {
    executionTimeMs: number;
    pointCount: number;
  };
}

/**
 * Error type for log metrics operations
 */
export interface LogMetricsError {
  message: string;
  code?: "NOT_FOUND" | "PERMISSION_DENIED" | "INVALID_ARGUMENT" | "INTERNAL";
}

/**
 * Validate metric name format
 * Metric names in Google Cloud follow the pattern: logging.googleapis.com/user/{metric_id}
 */
export function validateMetricName(metricName: string): Result<string, Error> {
  if (metricName.trim() === "") {
    return err(new Error("Metric name cannot be empty"));
  }

  // If it's already a fully qualified name, return it
  if (metricName.startsWith("logging.googleapis.com/user/")) {
    return ok(metricName);
  }

  // If it's just the metric ID, construct the full name
  if (metricName.includes("/") && !metricName.startsWith("logging.googleapis.com")) {
    return err(new Error("Invalid metric name format. Use either 'metric-id' or 'logging.googleapis.com/user/metric-id'"));
  }

  // Construct full metric name
  return ok(`logging.googleapis.com/user/${metricName}`);
}

/**
 * Validate alignment period format
 * Must be a duration string like "60s", "300s", etc.
 */
export function validateAlignmentPeriod(period: string | undefined): Result<string | undefined, Error> {
  if (period === undefined) {
    return ok(undefined);
  }

  // Check format: number followed by 's' or 'm' or 'h'
  const durationRegex = /^(\d+)(s|m|h|d)$/;
  const match = durationRegex.exec(period);

  if (match === null) {
    return err(new Error("Invalid alignment period format. Use format like '60s', '5m', '1h', or '1d'"));
  }

  const [, value, unit] = match;
  if (value === undefined || unit === undefined) {
    return err(new Error("Invalid alignment period format"));
  }

  const numValue = Number.parseInt(value, 10);
  if (Number.isNaN(numValue) || numValue <= 0) {
    return err(new Error("Alignment period must be a positive number"));
  }

  // Convert to seconds for API
  const seconds = ((): number => {
    switch (unit) {
      case 's': return numValue;
      case 'm': return numValue * 60;
      case 'h': return numValue * 3600;
      case 'd': return numValue * 86400;
      default: return numValue;
    }
  })();

  return ok(`${seconds}s`);
}

/**
 * Validate time range for metrics query
 */
export function validateTimeRange(startTime: string, endTime: string): Result<void, Error> {
  try {
    const start = new Date(startTime);
    const end = new Date(endTime);

    if (Number.isNaN(start.getTime())) {
      return err(new Error("Invalid start time format"));
    }

    if (Number.isNaN(end.getTime())) {
      return err(new Error("Invalid end time format"));
    }

    if (end <= start) {
      return err(new Error("End time must be after start time"));
    }

    return ok(undefined);
  } catch (error) {
    return err(error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * Format metric type for display
 */
export function formatMetricType(metricType: string): string {
  // Extract the metric ID from the full type
  // e.g., "logging.googleapis.com/user/my-metric" -> "my-metric"
  if (metricType.startsWith("logging.googleapis.com/user/")) {
    return metricType.replace("logging.googleapis.com/user/", "");
  }
  return metricType;
}

