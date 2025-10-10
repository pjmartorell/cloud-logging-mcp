/**
 * Health check utilities for verifying system status
 */

import type { CloudLoggingApi } from "../domain/api";

export interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  checks: {
    environment: HealthCheckStatus;
    authentication: HealthCheckStatus;
    apiConnectivity: HealthCheckStatus;
  };
  details?: string;
}

export interface HealthCheckStatus {
  status: 'pass' | 'fail' | 'warn';
  message?: string;
  error?: string;
}

/**
 * Performs a comprehensive health check of the MCP server
 * 
 * @param api The CloudLoggingApi instance to test
 * @returns Health check result with status of all components
 */
export async function performHealthCheck(api: CloudLoggingApi): Promise<HealthCheckResult> {
  const timestamp = new Date().toISOString();
  
  // Check 1: Environment variables
  const envCheck = checkEnvironment();
  
  // Check 2: Authentication (try to list projects)
  const authCheck = await checkAuthentication(api);
  
  // Check 3: API connectivity (make a simple query)
  const apiCheck = await checkApiConnectivity(api);
  
  // Determine overall status
  const allChecks = [envCheck, authCheck, apiCheck];
  const hasFailure = allChecks.some(check => check.status === 'fail');
  const hasWarning = allChecks.some(check => check.status === 'warn');
  
  const overallStatus = hasFailure 
    ? 'unhealthy' 
    : hasWarning 
      ? 'degraded' 
      : 'healthy';
  
  return {
    status: overallStatus,
    timestamp,
    checks: {
      environment: envCheck,
      authentication: authCheck,
      apiConnectivity: apiCheck,
    },
  };
}

function checkEnvironment(): HealthCheckStatus {
  const projectId = process.env.GOOGLE_CLOUD_PROJECT;
  const home = process.env.HOME;
  
  if (projectId === undefined || projectId === '') {
    return {
      status: 'fail',
      error: 'GOOGLE_CLOUD_PROJECT environment variable is not set',
    };
  }
  
  if (home === undefined || home === '') {
    return {
      status: 'fail',
      error: 'HOME environment variable is not set',
    };
  }
  
  return {
    status: 'pass',
    message: 'Environment variables are configured correctly',
  };
}

async function checkAuthentication(api: CloudLoggingApi): Promise<HealthCheckStatus> {
  try {
    const result = await api.listProjects({ pageSize: 1 });
    
    if (result.projects.length === 0) {
      return {
        status: 'warn',
        message: 'Authentication succeeded but no projects found',
      };
    }
    
    return {
      status: 'pass',
      message: `Authentication successful (found ${result.projects.length} project${result.projects.length === 1 ? '' : 's'})`,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      status: 'fail',
      error: `Authentication failed: ${errorMessage}`,
    };
  }
}

async function checkApiConnectivity(api: CloudLoggingApi): Promise<HealthCheckStatus> {
  const projectId = process.env.GOOGLE_CLOUD_PROJECT;
  
  if (projectId === undefined || projectId === '') {
    return {
      status: 'fail',
      error: 'Cannot test API connectivity without GOOGLE_CLOUD_PROJECT',
    };
  }
  
  try {
    // Try a minimal query with a very recent time range to minimize data transfer
    const now = new Date();
    const oneMinuteAgo = new Date(now.getTime() - 60 * 1000);
    
    const result = await api.entries({
      projectId,
      filter: `timestamp >= "${oneMinuteAgo.toISOString()}"`,
      pageSize: 1,
      orderBy: { timestamp: 'desc' },
    });
    
    if (result.isErr()) {
      return {
        status: 'fail',
        error: `API query failed: ${result.error.message}`,
      };
    }
    
    return {
      status: 'pass',
      message: 'API connectivity verified successfully',
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      status: 'fail',
      error: `API connectivity test failed: ${errorMessage}`,
    };
  }
}

