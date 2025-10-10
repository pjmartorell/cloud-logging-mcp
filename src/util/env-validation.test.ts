import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { validateEnvironment, validateEnvironmentOrThrow } from './env-validation';

describe('Environment Validation', () => {
  let originalEnv: typeof process.env;

  beforeEach(() => {
    originalEnv = process.env;
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('validateEnvironment', () => {
    it('should pass validation when all required variables are set', () => {
      process.env.GOOGLE_CLOUD_PROJECT = 'test-project';
      process.env.HOME = '/home/user';

      const result = validateEnvironment();

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail when GOOGLE_CLOUD_PROJECT is missing', () => {
      delete process.env.GOOGLE_CLOUD_PROJECT;
      process.env.HOME = '/home/user';

      const result = validateEnvironment();

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.variable).toBe('GOOGLE_CLOUD_PROJECT');
      expect(result.errors[0]?.suggestion).toBeDefined();
    });

    it('should fail when GOOGLE_CLOUD_PROJECT is empty', () => {
      process.env.GOOGLE_CLOUD_PROJECT = '';
      process.env.HOME = '/home/user';

      const result = validateEnvironment();

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.variable).toBe('GOOGLE_CLOUD_PROJECT');
    });

    it('should fail when HOME is missing', () => {
      process.env.GOOGLE_CLOUD_PROJECT = 'test-project';
      delete process.env.HOME;

      const result = validateEnvironment();

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.variable).toBe('HOME');
    });

    it('should fail when both required variables are missing', () => {
      delete process.env.GOOGLE_CLOUD_PROJECT;
      delete process.env.HOME;

      const result = validateEnvironment();

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(2);
      expect(result.errors.map(e => e.variable)).toContain('GOOGLE_CLOUD_PROJECT');
      expect(result.errors.map(e => e.variable)).toContain('HOME');
    });

    it('should warn when GOOGLE_APPLICATION_CREDENTIALS is set', () => {
      process.env.GOOGLE_CLOUD_PROJECT = 'test-project';
      process.env.HOME = '/home/user';
      process.env.GOOGLE_APPLICATION_CREDENTIALS = '/path/to/key.json';

      const result = validateEnvironment();

      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]?.variable).toBe('GOOGLE_APPLICATION_CREDENTIALS');
      expect(result.warnings[0]?.reason).toContain('not needed');
    });

    it('should warn when no credentials are found', () => {
      process.env.GOOGLE_CLOUD_PROJECT = 'test-project';
      process.env.HOME = '/nonexistent/home';
      delete process.env.GOOGLE_APPLICATION_CREDENTIALS;

      // Mock file system checker
      const mockFsChecker = { fileExists: vi.fn().mockReturnValue(false) };

      const result = validateEnvironment(mockFsChecker);

      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]?.variable).toBe('GOOGLE_CLOUD_CREDENTIALS');
      expect(result.warnings[0]?.reason).toContain('No authentication credentials');
    });

    it('should not warn when ADC file exists', () => {
      process.env.GOOGLE_CLOUD_PROJECT = 'test-project';
      process.env.HOME = '/home/user';
      delete process.env.GOOGLE_APPLICATION_CREDENTIALS;

      // Mock file system checker
      const mockFsChecker = { fileExists: vi.fn().mockReturnValue(true) };

      const result = validateEnvironment(mockFsChecker);

      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(0);
    });
  });

  describe('validateEnvironmentOrThrow', () => {
    it('should not throw when validation passes', () => {
      process.env.GOOGLE_CLOUD_PROJECT = 'test-project';
      process.env.HOME = '/home/user';

      expect(() => validateEnvironmentOrThrow()).not.toThrow();
    });

    it('should throw when validation fails', () => {
      delete process.env.GOOGLE_CLOUD_PROJECT;
      process.env.HOME = '/home/user';

      expect(() => validateEnvironmentOrThrow()).toThrow('Environment validation failed');
    });

    it('should include error details in thrown error', () => {
      delete process.env.GOOGLE_CLOUD_PROJECT;
      delete process.env.HOME;

      try {
        validateEnvironmentOrThrow();
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        const errorMessage = (error as Error).message;
        expect(errorMessage).toContain('GOOGLE_CLOUD_PROJECT');
        expect(errorMessage).toContain('HOME');
      }
    });

    it('should log warnings but not throw', () => {
      process.env.GOOGLE_CLOUD_PROJECT = 'test-project';
      process.env.HOME = '/home/user';
      process.env.GOOGLE_APPLICATION_CREDENTIALS = '/path/to/key.json';

      const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

      expect(() => validateEnvironmentOrThrow()).not.toThrow();
      expect(stderrSpy).toHaveBeenCalled();
      
      const stderrOutput = stderrSpy.mock.calls.map(call => call[0]).join('');
      expect(stderrOutput).toContain('GOOGLE_APPLICATION_CREDENTIALS');
    });
  });
});

