/**
 * Type augmentation for @google-cloud/logging
 * 
 * The SDK supports sslCreds option for providing custom gRPC credentials,
 * but this is not reflected in the published TypeScript types.
 * This declaration merges additional properties into the LoggingOptions interface.
 */

import type { ChannelCredentials } from '@grpc/grpc-js';

declare module '@google-cloud/logging' {
  interface LoggingOptions {
    /**
     * Custom gRPC SSL credentials for the Logging client.
     * This allows manual credential configuration to work around
     * authentication issues with google-auth-library v10.
     * 
     * @see https://grpc.github.io/grpc/node/grpc.credentials.html
     */
    sslCreds?: ChannelCredentials;
  }
}

