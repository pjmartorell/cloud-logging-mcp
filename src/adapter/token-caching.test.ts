import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GoogleCloudLoggingApiClient } from './api';

describe('Token Caching', () => {
  let originalEnv: typeof process.env;

  beforeEach(() => {
    originalEnv = process.env;
    process.env = { ...originalEnv, GOOGLE_CLOUD_PROJECT: 'test-project' };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it('should cache the Logging client when token is still valid', async () => {
    const client = new GoogleCloudLoggingApiClient();
    
    // Mock the auth.getClient method to track calls
    const getClientSpy = vi.spyOn(client['auth'], 'getClient');
    getClientSpy.mockResolvedValue({
      getAccessToken: vi.fn().mockResolvedValue({
        token: 'test-token-123',
        res: {
          data: {
            expiry_date: Date.now() + (60 * 60 * 1000), // 1 hour from now
          },
        },
      }),
    } as never);

    // First call should fetch a new token
    const firstClient = await client['getLoggingClient']();
    expect(getClientSpy).toHaveBeenCalledTimes(1);
    expect(firstClient).toBeDefined();

    // Second call should return cached client (no new auth call)
    const secondClient = await client['getLoggingClient']();
    expect(getClientSpy).toHaveBeenCalledTimes(1); // Still 1, not called again
    expect(secondClient).toBe(firstClient); // Same instance
  });

  it('should refresh token when expired', async () => {
    const client = new GoogleCloudLoggingApiClient();
    
    let callCount = 0;
    const getClientSpy = vi.spyOn(client['auth'], 'getClient');
    getClientSpy.mockImplementation(() => {
      callCount++;
      return Promise.resolve({
        getAccessToken: vi.fn().mockResolvedValue({
          token: `test-token-${callCount}`,
          res: {
            data: {
              // First call: token expires in 1 minute (will be expired on second call)
              // Second call: token expires in 1 hour
              expiry_date: callCount === 1 
                ? Date.now() + (1 * 60 * 1000)
                : Date.now() + (60 * 60 * 1000),
            },
          },
        }),
      } as never);
    });

    // First call
    const firstClient = await client['getLoggingClient']();
    expect(getClientSpy).toHaveBeenCalledTimes(1);
    expect(client['tokenExpiryTime']).toBeDefined();

    // Manually expire the token by setting tokenExpiryTime to past
    client['tokenExpiryTime'] = Date.now() - 1000;

    // Second call should fetch a new token
    const secondClient = await client['getLoggingClient']();
    expect(getClientSpy).toHaveBeenCalledTimes(2);
    expect(secondClient).not.toBe(firstClient); // Different instance
  });

  it('should use default expiry time when expiry_date is not provided', async () => {
    const client = new GoogleCloudLoggingApiClient();
    
    const getClientSpy = vi.spyOn(client['auth'], 'getClient');
    getClientSpy.mockResolvedValue({
      getAccessToken: vi.fn().mockResolvedValue({
        token: 'test-token-no-expiry',
        res: {
          data: {}, // No expiry_date provided
        },
      }),
    } as never);

    const beforeCall = Date.now();
    await client['getLoggingClient']();
    const afterCall = Date.now();

    // Should default to 55 minutes from now
    const expectedExpiry = beforeCall + (55 * 60 * 1000);
    const actualExpiry = client['tokenExpiryTime'] ?? 0;
    
    // Allow 1 second tolerance for test execution time
    expect(actualExpiry).toBeGreaterThanOrEqual(expectedExpiry);
    expect(actualExpiry).toBeLessThanOrEqual(afterCall + (55 * 60 * 1000));
  });

  it('should clear cache and retry on error', async () => {
    const client = new GoogleCloudLoggingApiClient();
    
    let callCount = 0;
    const getClientSpy = vi.spyOn(client['auth'], 'getClient');
    getClientSpy.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.reject(new Error('Auth failed'));
      }
      return Promise.resolve({
        getAccessToken: vi.fn().mockResolvedValue({
          token: 'test-token-recovered',
          res: {
            data: {
              expiry_date: Date.now() + (60 * 60 * 1000),
            },
          },
        }),
      } as never);
    });

    // First call should fail and clear cache
    const firstClient = await client['getLoggingClient']();
    expect(client['cachedLoggingClient']).toBeUndefined();
    expect(client['tokenExpiryTime']).toBeUndefined();
    expect(firstClient).toBeDefined(); // Fallback client

    // Second call should succeed and cache
    const secondClient = await client['getLoggingClient']();
    expect(client['cachedLoggingClient']).toBeDefined();
    expect(client['tokenExpiryTime']).toBeDefined();
    expect(secondClient).toBeDefined();
  });

  it('should respect 5-minute buffer before expiry', async () => {
    const client = new GoogleCloudLoggingApiClient();
    
    const getClientSpy = vi.spyOn(client['auth'], 'getClient');
    getClientSpy.mockResolvedValue({
      getAccessToken: vi.fn().mockResolvedValue({
        token: 'test-token-buffer',
        res: {
          data: {
            expiry_date: Date.now() + (60 * 60 * 1000),
          },
        },
      }),
    } as never);

    // First call
    await client['getLoggingClient']();
    expect(getClientSpy).toHaveBeenCalledTimes(1);

    // Set expiry to 4 minutes from now (within the 5-minute buffer)
    client['tokenExpiryTime'] = Date.now() + (4 * 60 * 1000);

    // Should refresh because we're within the buffer
    await client['getLoggingClient']();
    expect(getClientSpy).toHaveBeenCalledTimes(2);
  });
});

