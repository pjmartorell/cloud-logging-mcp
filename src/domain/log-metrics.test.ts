import { describe, it, expect } from 'vitest';
import {
  validateMetricName,
  validateAlignmentPeriod,
  validateTimeRange,
  formatMetricType,
} from './log-metrics';

describe('Log Metrics Domain', () => {
  describe('validateMetricName', () => {
    it('should accept simple metric names and expand them', () => {
      const result = validateMetricName('my-error-metric');
      
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toBe('logging.googleapis.com/user/my-error-metric');
      }
    });

    it('should accept fully qualified metric names', () => {
      const result = validateMetricName('logging.googleapis.com/user/my-metric');
      
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toBe('logging.googleapis.com/user/my-metric');
      }
    });

    it('should reject empty metric names', () => {
      const result = validateMetricName('');
      
      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain('cannot be empty');
      }
    });

    it('should reject invalid metric name formats', () => {
      const result = validateMetricName('invalid/format/metric');
      
      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain('Invalid metric name format');
      }
    });
  });

  describe('validateAlignmentPeriod', () => {
    it('should accept undefined alignment period', () => {
      const result = validateAlignmentPeriod(undefined);
      
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toBeUndefined();
      }
    });

    it('should accept seconds format', () => {
      const result = validateAlignmentPeriod('60s');
      
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toBe('60s');
      }
    });

    it('should accept and convert minutes to seconds', () => {
      const result = validateAlignmentPeriod('5m');
      
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toBe('300s');
      }
    });

    it('should accept and convert hours to seconds', () => {
      const result = validateAlignmentPeriod('1h');
      
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toBe('3600s');
      }
    });

    it('should accept and convert days to seconds', () => {
      const result = validateAlignmentPeriod('1d');
      
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toBe('86400s');
      }
    });

    it('should reject invalid format (no unit)', () => {
      const result = validateAlignmentPeriod('60');
      
      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain('Invalid alignment period format');
      }
    });

    it('should reject invalid format (invalid unit)', () => {
      const result = validateAlignmentPeriod('60x');
      
      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain('Invalid alignment period format');
      }
    });

    it('should reject negative values', () => {
      const result = validateAlignmentPeriod('-5m');
      
      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain('Invalid alignment period format');
      }
    });

    it('should reject zero values', () => {
      const result = validateAlignmentPeriod('0s');
      
      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain('must be a positive number');
      }
    });
  });

  describe('validateTimeRange', () => {
    it('should accept valid time range', () => {
      const result = validateTimeRange(
        '2024-01-01T00:00:00Z',
        '2024-01-01T23:59:59Z'
      );
      
      expect(result.isOk()).toBe(true);
    });

    it('should reject when end time is before start time', () => {
      const result = validateTimeRange(
        '2024-01-02T00:00:00Z',
        '2024-01-01T00:00:00Z'
      );
      
      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain('End time must be after start time');
      }
    });

    it('should reject when end time equals start time', () => {
      const result = validateTimeRange(
        '2024-01-01T00:00:00Z',
        '2024-01-01T00:00:00Z'
      );
      
      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain('End time must be after start time');
      }
    });

    it('should reject invalid start time format', () => {
      const result = validateTimeRange(
        'invalid-time',
        '2024-01-01T23:59:59Z'
      );
      
      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain('Invalid start time format');
      }
    });

    it('should reject invalid end time format', () => {
      const result = validateTimeRange(
        '2024-01-01T00:00:00Z',
        'invalid-time'
      );
      
      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain('Invalid end time format');
      }
    });
  });

  describe('formatMetricType', () => {
    it('should extract metric ID from full type', () => {
      const formatted = formatMetricType('logging.googleapis.com/user/my-metric');
      expect(formatted).toBe('my-metric');
    });

    it('should return the type as-is if not a full name', () => {
      const formatted = formatMetricType('my-metric');
      expect(formatted).toBe('my-metric');
    });

    it('should handle complex metric names', () => {
      const formatted = formatMetricType('logging.googleapis.com/user/database-errors-prod');
      expect(formatted).toBe('database-errors-prod');
    });
  });
});

