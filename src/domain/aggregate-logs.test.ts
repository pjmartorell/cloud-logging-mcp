import { describe, it, expect } from 'vitest';
import {
  buildAggregationFilter,
  groupLogEntries,
  formatGroupedResults,
  groupLogEntriesByTime,
  formatTimeSeriesResults,
  timeIntervalToSeconds,
  extractFieldValue,
} from './aggregate-logs';
import type { RawLogEntry } from './api';
import { createLogId } from './log-id';

describe('Aggregate Logs Domain', () => {
  describe('buildAggregationFilter', () => {
    it('should build filter with time range only', () => {
      const result = buildAggregationFilter({
        projectId: 'test-project',
        startTime: '2024-01-01T00:00:00Z',
        endTime: '2024-01-01T23:59:59Z',
        aggregation: { type: 'count' },
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toContain('timestamp >= "2024-01-01T00:00:00Z"');
        expect(result.value).toContain('timestamp <= "2024-01-01T23:59:59Z"');
      }
    });

    it('should combine time range with additional filter', () => {
      const result = buildAggregationFilter({
        projectId: 'test-project',
        startTime: '2024-01-01T00:00:00Z',
        endTime: '2024-01-01T23:59:59Z',
        filter: 'severity>=ERROR',
        aggregation: { type: 'count' },
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toContain('timestamp >= "2024-01-01T00:00:00Z"');
        expect(result.value).toContain('severity>=ERROR');
        expect(result.value).toContain('AND');
      }
    });

    it('should fail with invalid time range', () => {
      const result = buildAggregationFilter({
        projectId: 'test-project',
        startTime: '2024-01-02T00:00:00Z',
        endTime: '2024-01-01T00:00:00Z', // End before start
        aggregation: { type: 'count' },
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain('end time must be after start time');
      }
    });
  });

  describe('extractFieldValue', () => {
    const entry: RawLogEntry = {
      insertId: createLogId('test-id'),
      timestamp: '2024-01-01T00:00:00Z',
      severity: 'ERROR',
      jsonPayload: {
        message: 'Test message',
        nested: {
          field: 'value',
        },
      },
      labels: {
        service: 'test-service',
      },
      resource: {
        type: 'k8s_pod',
        labels: {
          pod_name: 'test-pod',
        },
      },
    };

    it('should extract top-level field', () => {
      expect(extractFieldValue(entry, 'severity')).toBe('ERROR');
    });

    it('should extract nested field with dot notation', () => {
      expect(extractFieldValue(entry, 'jsonPayload.message')).toBe('Test message');
      expect(extractFieldValue(entry, 'jsonPayload.nested.field')).toBe('value');
    });

    it('should extract label field', () => {
      expect(extractFieldValue(entry, 'labels.service')).toBe('test-service');
    });

    it('should extract resource field', () => {
      expect(extractFieldValue(entry, 'resource.type')).toBe('k8s_pod');
      expect(extractFieldValue(entry, 'resource.labels.pod_name')).toBe('test-pod');
    });

    it('should return "unknown" for missing field', () => {
      expect(extractFieldValue(entry, 'nonexistent')).toBe('unknown');
      expect(extractFieldValue(entry, 'jsonPayload.missing')).toBe('unknown');
    });
  });

  describe('groupLogEntries', () => {
    const entries: RawLogEntry[] = [
      {
        insertId: createLogId('1'),
        timestamp: '2024-01-01T00:00:00Z',
        severity: 'ERROR',
        jsonPayload: { message: 'Error 1' },
      },
      {
        insertId: createLogId('2'),
        timestamp: '2024-01-01T00:01:00Z',
        severity: 'ERROR',
        jsonPayload: { message: 'Error 2' },
      },
      {
        insertId: createLogId('3'),
        timestamp: '2024-01-01T00:02:00Z',
        severity: 'WARNING',
        jsonPayload: { message: 'Warning 1' },
      },
      {
        insertId: createLogId('4'),
        timestamp: '2024-01-01T00:03:00Z',
        severity: 'INFO',
        jsonPayload: { message: 'Info 1' },
      },
    ];

    it('should group by single field', () => {
      const groups = groupLogEntries(entries, ['severity']);

      expect(groups.size).toBe(3);
      expect(groups.get('ERROR')).toHaveLength(2);
      expect(groups.get('WARNING')).toHaveLength(1);
      expect(groups.get('INFO')).toHaveLength(1);
    });

    it('should group by multiple fields', () => {
      const entries2: RawLogEntry[] = [
        {
          insertId: createLogId('1'),
          timestamp: '2024-01-01T00:00:00Z',
          severity: 'ERROR',
          resource: { type: 'k8s_pod' },
        },
        {
          insertId: createLogId('2'),
          timestamp: '2024-01-01T00:01:00Z',
          severity: 'ERROR',
          resource: { type: 'k8s_container' },
        },
        {
          insertId: createLogId('3'),
          timestamp: '2024-01-01T00:02:00Z',
          severity: 'WARNING',
          resource: { type: 'k8s_pod' },
        },
      ];

      const groups = groupLogEntries(entries2, ['severity', 'resource.type']);

      expect(groups.size).toBe(3);
      expect(groups.get('ERROR::k8s_pod')).toHaveLength(1);
      expect(groups.get('ERROR::k8s_container')).toHaveLength(1);
      expect(groups.get('WARNING::k8s_pod')).toHaveLength(1);
    });
  });

  describe('formatGroupedResults', () => {
    it('should format grouped results with counts', () => {
      const groups = new Map<string, RawLogEntry[]>();
      groups.set('ERROR', [
        { insertId: createLogId('1'), timestamp: '2024-01-01T00:00:00Z', severity: 'ERROR' },
        { insertId: createLogId('2'), timestamp: '2024-01-01T00:01:00Z', severity: 'ERROR' },
      ]);
      groups.set('WARNING', [
        { insertId: createLogId('3'), timestamp: '2024-01-01T00:02:00Z', severity: 'WARNING' },
      ]);

      const results = formatGroupedResults(groups);

      expect(results).toHaveLength(2);
      expect(results[0]?.group).toEqual({ 'ERROR': 'ERROR' });
      expect(results[0]?.count).toBe(2);
      expect(results[1]?.group).toEqual({ 'WARNING': 'WARNING' });
      expect(results[1]?.count).toBe(1);
    });

    it('should handle multi-field groups', () => {
      const groups = new Map<string, RawLogEntry[]>();
      groups.set('ERROR::k8s_pod', [
        {
          insertId: createLogId('1'),
          timestamp: '2024-01-01T00:00:00Z',
          severity: 'ERROR',
          resource: { type: 'k8s_pod' },
        },
      ]);

      const results = formatGroupedResults(groups);

      expect(results).toHaveLength(1);
      expect(results[0]?.group).toEqual({ 'field0::field1': 'ERROR::k8s_pod' });
      expect(results[0]?.count).toBe(1);
    });
  });

  describe('timeIntervalToSeconds', () => {
    it('should convert minute intervals', () => {
      expect(timeIntervalToSeconds('1m')).toBe(60);
      expect(timeIntervalToSeconds('5m')).toBe(300);
      expect(timeIntervalToSeconds('15m')).toBe(900);
      expect(timeIntervalToSeconds('30m')).toBe(1800);
    });

    it('should convert hour intervals', () => {
      expect(timeIntervalToSeconds('1h')).toBe(3600);
      expect(timeIntervalToSeconds('6h')).toBe(21600);
      expect(timeIntervalToSeconds('12h')).toBe(43200);
      expect(timeIntervalToSeconds('24h')).toBe(86400);
    });
  });

  describe('groupLogEntriesByTime', () => {
    const entries: RawLogEntry[] = [
      {
        insertId: createLogId('1'),
        timestamp: '2024-01-01T00:00:00Z',
        severity: 'ERROR',
      },
      {
        insertId: createLogId('2'),
        timestamp: '2024-01-01T00:04:00Z',
        severity: 'ERROR',
      },
      {
        insertId: createLogId('3'),
        timestamp: '2024-01-01T00:05:00Z',
        severity: 'WARNING',
      },
      {
        insertId: createLogId('4'),
        timestamp: '2024-01-01T00:11:00Z',
        severity: 'INFO',
      },
    ];

    it('should group by 5-minute intervals', () => {
      const buckets = groupLogEntriesByTime(
        entries,
        300, // 5 minutes
        '2024-01-01T00:00:00Z',
        '2024-01-01T00:12:00Z' // Changed to 12 minutes to get exactly 3 buckets (0-5, 5-10, 10-15 would be 15 minutes)
      );

      // The buckets should be: 0:00-0:05, 0:05-0:10, 0:10-0:12
      // But since entries go to 0:11, we should have 3 buckets total
      expect(buckets.size).toBeGreaterThanOrEqual(3);
      
      const bucket1 = buckets.get('2024-01-01T00:00:00.000Z');
      expect(bucket1).toHaveLength(2); // Two entries at 0:00 and 0:04

      const bucket2 = buckets.get('2024-01-01T00:05:00.000Z');
      expect(bucket2).toHaveLength(1); // One entry at 0:05

      const bucket3 = buckets.get('2024-01-01T00:10:00.000Z');
      expect(bucket3).toHaveLength(1); // One entry at 0:11
    });

    it('should create empty buckets for intervals with no entries', () => {
      const buckets = groupLogEntriesByTime(
        [entries[0] as RawLogEntry], // Only first entry
        300, // 5 minutes
        '2024-01-01T00:00:00Z',
        '2024-01-01T00:12:00Z' // Match the previous test
      );

      // Should have buckets for all intervals, even empty ones
      expect(buckets.size).toBeGreaterThanOrEqual(3);
      
      const bucket1 = buckets.get('2024-01-01T00:00:00.000Z');
      expect(bucket1).toHaveLength(1);

      const bucket2 = buckets.get('2024-01-01T00:05:00.000Z');
      expect(bucket2).toHaveLength(0); // Empty

      const bucket3 = buckets.get('2024-01-01T00:10:00.000Z');
      expect(bucket3).toHaveLength(0); // Empty
    });
  });

  describe('formatTimeSeriesResults', () => {
    it('should format time buckets with counts', () => {
      const buckets = new Map<string, RawLogEntry[]>();
      buckets.set('2024-01-01T00:00:00.000Z', [
        { insertId: createLogId('1'), timestamp: '2024-01-01T00:00:00Z', severity: 'ERROR' },
        { insertId: createLogId('2'), timestamp: '2024-01-01T00:04:00Z', severity: 'ERROR' },
      ]);
      buckets.set('2024-01-01T00:05:00.000Z', [
        { insertId: createLogId('3'), timestamp: '2024-01-01T00:05:00Z', severity: 'WARNING' },
      ]);

      const results = formatTimeSeriesResults(buckets);

      expect(results).toHaveLength(2);
      expect(results[0]?.timestamp).toBe('2024-01-01T00:00:00.000Z');
      expect(results[0]?.count).toBe(2);
      expect(results[1]?.timestamp).toBe('2024-01-01T00:05:00.000Z');
      expect(results[1]?.count).toBe(1);
    });

    it('should sort results by timestamp', () => {
      const buckets = new Map<string, RawLogEntry[]>();
      // Add buckets in non-chronological order
      buckets.set('2024-01-01T00:10:00.000Z', [
        { insertId: createLogId('3'), timestamp: '2024-01-01T00:10:00Z', severity: 'INFO' },
      ]);
      buckets.set('2024-01-01T00:00:00.000Z', [
        { insertId: createLogId('1'), timestamp: '2024-01-01T00:00:00Z', severity: 'ERROR' },
      ]);
      buckets.set('2024-01-01T00:05:00.000Z', [
        { insertId: createLogId('2'), timestamp: '2024-01-01T00:05:00Z', severity: 'WARNING' },
      ]);

      const results = formatTimeSeriesResults(buckets);

      expect(results).toHaveLength(3);
      expect(results[0]?.timestamp).toBe('2024-01-01T00:00:00.000Z');
      expect(results[1]?.timestamp).toBe('2024-01-01T00:05:00.000Z');
      expect(results[2]?.timestamp).toBe('2024-01-01T00:10:00.000Z');
    });
  });
});
