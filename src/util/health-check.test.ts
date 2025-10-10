import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { performHealthCheck } from './health-check';
import type { CloudLoggingApi } from '../domain/api';
import { ok, err } from 'neverthrow';

describe('Health Check', () => {
  let originalEnv: typeof process.env;
  let mockApi: CloudLoggingApi;

  beforeEach(() => {
    originalEnv = process.env;
    process.env = { 
      ...originalEnv, 
      GOOGLE_CLOUD_PROJECT: 'test-project',
      HOME: '/home/user'
    };
    
    // Default mock API - create a properly typed mock without type assertions
    const mockListProjects = vi.fn().mockResolvedValue({ 
      projects: [{ 
        projectId: 'test-project', 
        name: 'Test Project', 
        state: 'ACTIVE' as const, 
        createTime: '2023-01-01T00:00:00Z' 
      }] 
    });
    const mockEntries = vi.fn().mockResolvedValue(ok({ entries: [], nextPageToken: undefined }));
    
    mockApi = {
      listProjects: mockListProjects,
      entries: mockEntries,
    };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it('should return healthy status when all checks pass', async () => {
    const result = await performHealthCheck(mockApi);

    expect(result.status).toBe('healthy');
    expect(result.checks.environment.status).toBe('pass');
    expect(result.checks.authentication.status).toBe('pass');
    expect(result.checks.apiConnectivity.status).toBe('pass');
    expect(result.timestamp).toBeDefined();
  });

  it('should return unhealthy when environment check fails', async () => {
    delete process.env.GOOGLE_CLOUD_PROJECT;

    const result = await performHealthCheck(mockApi);

    expect(result.status).toBe('unhealthy');
    expect(result.checks.environment.status).toBe('fail');
    expect(result.checks.environment.error).toContain('GOOGLE_CLOUD_PROJECT');
  });

  it('should return unhealthy when HOME is missing', async () => {
    delete process.env.HOME;

    const result = await performHealthCheck(mockApi);

    expect(result.status).toBe('unhealthy');
    expect(result.checks.environment.status).toBe('fail');
    expect(result.checks.environment.error).toContain('HOME');
  });

  it('should return unhealthy when authentication fails', async () => {
    mockApi.listProjects = vi.fn().mockRejectedValue(new Error('Auth failed'));

    const result = await performHealthCheck(mockApi);

    expect(result.status).toBe('unhealthy');
    expect(result.checks.authentication.status).toBe('fail');
    expect(result.checks.authentication.error).toContain('Auth failed');
  });

  it('should return degraded when no projects are found', async () => {
    mockApi.listProjects = vi.fn().mockResolvedValue({ projects: [] });

    const result = await performHealthCheck(mockApi);

    expect(result.status).toBe('degraded');
    expect(result.checks.authentication.status).toBe('warn');
    expect(result.checks.authentication.message).toContain('no projects found');
  });

  it('should return unhealthy when API connectivity fails', async () => {
    mockApi.entries = vi.fn().mockResolvedValue(err({ message: 'API error', code: 'INTERNAL' as const }));

    const result = await performHealthCheck(mockApi);

    expect(result.status).toBe('unhealthy');
    expect(result.checks.apiConnectivity.status).toBe('fail');
    expect(result.checks.apiConnectivity.error).toContain('API error');
  });

  it('should return unhealthy when API throws an exception', async () => {
    mockApi.entries = vi.fn().mockRejectedValue(new Error('Network error'));

    const result = await performHealthCheck(mockApi);

    expect(result.status).toBe('unhealthy');
    expect(result.checks.apiConnectivity.status).toBe('fail');
    expect(result.checks.apiConnectivity.error).toContain('Network error');
  });

  it('should include successful message for authentication', async () => {
    mockApi.listProjects = vi.fn().mockResolvedValue({ 
      projects: [
        { projectId: 'project1', name: 'Project 1', state: 'ACTIVE' as const, createTime: '2023-01-01T00:00:00Z' },
        { projectId: 'project2', name: 'Project 2', state: 'ACTIVE' as const, createTime: '2023-01-01T00:00:00Z' }
      ] 
    });

    const result = await performHealthCheck(mockApi);

    expect(result.checks.authentication.status).toBe('pass');
    expect(result.checks.authentication.message).toContain('found 2 projects');
  });

  it('should call API with minimal query parameters', async () => {
    const entriesSpy = vi.spyOn(mockApi, 'entries');

    await performHealthCheck(mockApi);

    expect(entriesSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'test-project',
        pageSize: 1,
        orderBy: { timestamp: 'desc' },
      })
    );
    
    const callArgs = entriesSpy.mock.calls[0]?.[0];
    expect(callArgs?.filter).toMatch(/timestamp >= ".*"/);
  });
});

