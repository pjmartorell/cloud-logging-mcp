/**
 * Environment variable validation utilities
 */

import { existsSync } from 'node:fs';

export interface EnvironmentValidationError {
  variable: string;
  reason: string;
  suggestion?: string;
}

export interface EnvironmentValidationResult {
  valid: boolean;
  errors: EnvironmentValidationError[];
  warnings: EnvironmentValidationError[];
}

/**
 * File system check abstraction for testing
 */
export interface FileSystemChecker {
  fileExists: (path: string) => boolean;
}

const defaultFsChecker: FileSystemChecker = {
  fileExists: (path: string) => existsSync(path),
};

/**
 * Validates that all required environment variables are present and properly configured.
 * 
 * @param fsChecker Optional file system checker (for testing)
 * @returns Validation result with any errors or warnings
 */
export function validateEnvironment(fsChecker: FileSystemChecker = defaultFsChecker): EnvironmentValidationResult {
  const errors: EnvironmentValidationError[] = [];
  const warnings: EnvironmentValidationError[] = [];

  // Required variables
  const projectId = process.env.GOOGLE_CLOUD_PROJECT;
  if (projectId === undefined || projectId === '') {
    errors.push({
      variable: 'GOOGLE_CLOUD_PROJECT',
      reason: 'Required environment variable is missing or empty',
      suggestion: 'Set GOOGLE_CLOUD_PROJECT to your GCP project ID (e.g., export GOOGLE_CLOUD_PROJECT="my-project")',
    });
  }

  const home = process.env.HOME;
  if (home === undefined || home === '') {
    errors.push({
      variable: 'HOME',
      reason: 'Required environment variable is missing or empty',
      suggestion: 'HOME should be automatically set by your system. If running in a container, ensure HOME is set.',
    });
  }

  // Check for deprecated/unnecessary configuration
  const googleAppCreds = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (googleAppCreds !== undefined && googleAppCreds !== '') {
    warnings.push({
      variable: 'GOOGLE_APPLICATION_CREDENTIALS',
      reason: 'This variable is set but not needed when using Application Default Credentials (ADC)',
      suggestion: 'If you\'ve run "gcloud auth application-default login", you can unset this variable. ADC is preferred for local development.',
    });
  }

  // Check if ADC file exists
  if (home !== undefined && home !== '') {
    const adcPath = `${home}/.config/gcloud/application_default_credentials.json`;
    const adcExists = fsChecker.fileExists(adcPath);
    
    if (!adcExists && (googleAppCreds === undefined || googleAppCreds === '')) {
      warnings.push({
        variable: 'GOOGLE_CLOUD_CREDENTIALS',
        reason: 'No authentication credentials found',
        suggestion: 'Run "gcloud auth application-default login" or set GOOGLE_APPLICATION_CREDENTIALS to a service account key file',
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Logs warnings to stderr
 */
function logWarnings(warnings: EnvironmentValidationError[]): void {
  if (warnings.length === 0) {
    return;
  }
  
  process.stderr.write('⚠️  Environment warnings:\n');
  for (const warning of warnings) {
    process.stderr.write(`  - ${warning.variable}: ${warning.reason}\n`);
    if (warning.suggestion !== undefined) {
      process.stderr.write(`    💡 ${warning.suggestion}\n`);
    }
  }
  process.stderr.write('\n');
}

/**
 * Validates environment and throws an error if validation fails.
 * Logs warnings but doesn't fail on warnings.
 * 
 * @throws {Error} If required environment variables are missing
 */
export function validateEnvironmentOrThrow(): void {
  const result = validateEnvironment();

  // Log warnings
  logWarnings(result.warnings);

  // Throw on errors
  if (!result.valid) {
    const errorMessages = result.errors.map(error => {
      const baseMsg = `  ❌ ${error.variable}: ${error.reason}`;
      return error.suggestion !== undefined
        ? `${baseMsg}\n     💡 ${error.suggestion}`
        : baseMsg;
    }).join('\n\n');

    throw new Error(
      `Environment validation failed. Please fix the following issues:\n\n${errorMessages}`
    );
  }
}

