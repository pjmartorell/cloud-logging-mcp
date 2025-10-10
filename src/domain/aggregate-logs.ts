import { ok, err, type Result } from "neverthrow";
import type { RawLogEntry } from "./api";

/**
 * Time intervals for time series aggregation
 */
type TimeInterval = "1m" | "5m" | "15m" | "30m" | "1h" | "6h" | "12h" | "24h";

/**
 * Input for log aggregation
 */
export interface AggregationInput {
  projectId: string;
  startTime: string;
  endTime: string;
  filter?: string;
  aggregation:
    | { type: "count" }
    | { type: "group_by"; groupBy: string[] }
    | { type: "time_series"; timeInterval: TimeInterval };
  pageSize?: number;
  pageToken?: string;
}

/**
 * Output from log aggregation
 */
export interface AggregationOutput {
  aggregation:
    | {
        type: "count";
        results: Array<{ count: number }>;
      }
    | {
        type: "group_by";
        results: Array<{ group: Record<string, string>; count: number }>;
      }
    | {
        type: "time_series";
        results: Array<{ timestamp: string; count: number }>;
      };
  nextPageToken?: string;
}

/**
 * Build aggregation filter combining user filter with time range
 */
export function buildAggregationFilter(input: AggregationInput): Result<string, Error> {
  try {
    // Validate time range
    const startTime = new Date(input.startTime);
    const endTime = new Date(input.endTime);

    if (endTime <= startTime) {
      return err(new Error("Invalid time range: end time must be after start time"));
    }

    const filters: string[] = [];

    // Add user's filter first
    if (input.filter !== undefined && input.filter.trim() !== "") {
      filters.push(`(${input.filter})`);
    }

    // Add time range
    filters.push(`timestamp >= "${input.startTime}"`);
    filters.push(`timestamp <= "${input.endTime}"`);

    return ok(filters.join(" AND "));
  } catch (error) {
    return err(error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * Convert time interval to seconds
 */
export function timeIntervalToSeconds(interval: TimeInterval): number {
  const map: Record<TimeInterval, number> = {
    "1m": 60,
    "5m": 300,
    "15m": 900,
    "30m": 1800,
    "1h": 3600,
    "6h": 21600,
    "12h": 43200,
    "24h": 86400,
  };
  return map[interval];
}

/**
 * Extract field value from log entry using dot notation
 */
export function extractFieldValue(entry: unknown, fieldPath: string): string {
  if (entry === null || entry === undefined || typeof entry !== 'object') {
    return 'unknown';
  }

  const parts = fieldPath.split(".");
  
  const traverse = (current: unknown, remainingParts: string[]): string => {
    if (remainingParts.length === 0) {
      return current === null || current === undefined ? 'unknown' : String(current);
    }

    if (current === null || current === undefined || typeof current !== 'object') {
      return 'unknown';
    }

    const [part, ...rest] = remainingParts;
    if (part === undefined || !(part in current)) {
      return 'unknown';
    }

    const nextValue: unknown = Object.getOwnPropertyDescriptor(current, part)?.value;
    return traverse(nextValue, rest);
  };

  return traverse(entry, parts);
}

/**
 * Group log entries by specified fields
 */
export function groupLogEntries(
  entries: RawLogEntry[],
  groupByFields: string[]
): Map<string, RawLogEntry[]> {
  const groups = new Map<string, RawLogEntry[]>();

  for (const entry of entries) {
    const groupKey = groupByFields
      .map(field => extractFieldValue(entry, field))
      .join("::");

    const group = groups.get(groupKey);
    if (group !== undefined) {
      group.push(entry);
    } else {
      groups.set(groupKey, [entry]);
    }
  }

  return groups;
}

/**
 * Format grouped results for output
 */
export function formatGroupedResults(
  groups: Map<string, RawLogEntry[]>
): Array<{ group: Record<string, string>; count: number }> {
  const results: Array<{ group: Record<string, string>; count: number }> = [];

  for (const [groupKey, entries] of groups.entries()) {
    const group: Record<string, string> = {};

    // If the group key contains ::, it's a multi-field group
    if (groupKey.includes("::")) {
      // For multi-field groups, create a single key with the combined value
      group[groupKey.split("::").map((_,i) => `field${i}`).join("::")] = groupKey;
    } else {
      // For single field groups, extract the field name from the first entry
      // Since we lost the field name in grouping, we'll use a generic key
      group[groupKey] = groupKey;
    }

    results.push({ group, count: entries.length });
  }

  // Sort by count descending
  return results.sort((a, b) => b.count - a.count);
}

/**
 * Group log entries by time buckets
 */
export function groupLogEntriesByTime(
  entries: RawLogEntry[],
  intervalSeconds: number,
  startTime: string,
  endTime: string
): Map<string, RawLogEntry[]> {
  const startMs = new Date(startTime).getTime();
  const endMs = new Date(endTime).getTime();
  const intervalMs = intervalSeconds * 1000;

  // Initialize all buckets using Array.from instead of for loop
  const timeStamps = Array.from(
    { length: Math.ceil((endMs - startMs) / intervalMs) },
    (_, i) => startMs + i * intervalMs
  );
  
  const buckets = new Map<string, RawLogEntry[]>(
    timeStamps.map(time => [new Date(time).toISOString(), []])
  );

  // Assign entries to buckets
  for (const entry of entries) {
    const entryTime = new Date(entry.timestamp).getTime();
    
    // Find the bucket this entry belongs to
    if (entryTime >= startMs && entryTime < endMs) {
      const bucketIndex = Math.floor((entryTime - startMs) / intervalMs);
      const bucketTime = new Date(startMs + bucketIndex * intervalMs).toISOString();

      const bucket = buckets.get(bucketTime);
      if (bucket !== undefined) {
        bucket.push(entry);
      }
    }
  }

  return buckets;
}

/**
 * Format time series results for output
 */
export function formatTimeSeriesResults(
  buckets: Map<string, RawLogEntry[]>
): Array<{ timestamp: string; count: number }> {
  const results: Array<{ timestamp: string; count: number }> = [];

  for (const [timestamp, entries] of buckets.entries()) {
    results.push({ timestamp, count: entries.length });
  }

  // Sort by timestamp
  return results.sort((a, b) => {
    const timeA = new Date(a.timestamp).getTime();
    const timeB = new Date(b.timestamp).getTime();
    return timeA - timeB;
  });
}
