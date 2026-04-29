import protobuf from 'protobufjs';
import { getProtoPath } from 'google-proto-files';
import { Result, ok, err } from 'neverthrow';

// Cache for loaded proto roots
const protoCache = new Map<string, protobuf.Root>();

/**
 * Checks if value is a record-like object
 */
function isRecordLike(value: unknown): boolean {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Converts a JSON-stringified Buffer back to a Buffer
 * JSON.stringify converts Buffers to {type: "Buffer", data: [1,2,3,...]}
 */
function convertJsonifiedBufferIfNeeded(value: unknown): unknown {
  if (!isRecordLike(value)) {
    return value;
  }

  const obj = value as Record<string, unknown>;
  
  if (
    'type' in obj &&
    'data' in obj &&
    obj.type === 'Buffer' &&
    Array.isArray(obj.data)
  ) {
    return Buffer.from(obj.data as number[]);
  }

  return value;
}

/**
 * Decodes a protobuf payload with type_url and value Buffer
 */
export async function decodeProtoPayload(
  payload: unknown
): Promise<Result<Record<string, unknown> | undefined, Error>> {
  if (payload === null || payload === undefined) {
    return ok(undefined);
  }

  if (typeof payload !== 'object') {
    return ok(undefined);
  }

  // Runtime check: ensure payload is a record-like object
  if (!isRecordLike(payload)) {
    return ok(undefined);
  }

  // We've confirmed payload is an object, so we can safely access properties
  const payloadRecord = payload as Record<string, unknown>;

  // Check if this is a protobuf Any message with type_url and value
  if (!('type_url' in payloadRecord) || !('value' in payloadRecord)) {
    // Not a protobuf Any message, return as-is (already decoded by SDK)
    return ok(payloadRecord);
  }

  const typeUrl = payloadRecord.type_url;
  const rawValue = payloadRecord.value;

  if (typeof typeUrl !== 'string') {
    return ok(payloadRecord);
  }

  // Check if value is a JSON-stringified Buffer: {type: "Buffer", data: [...]}
  // and convert it back to a Buffer
  const value = convertJsonifiedBufferIfNeeded(rawValue);

  // Handle Buffer value
  if (!Buffer.isBuffer(value) && !(value instanceof Uint8Array)) {
    // Already decoded or not a Buffer
    return ok(payloadRecord);
  }

  try {
    // Extract the message type name from type_url
    // e.g., "type.googleapis.com/google.cloud.audit.AuditLog" -> "google.cloud.audit.AuditLog"
    const typeName = typeUrl.substring(typeUrl.lastIndexOf('/') + 1);

    // Determine the proto file path based on the type
    const protoFile = getProtoFileForType(typeName);
    if (protoFile === undefined) {
      // Unknown type, return original payload
      return ok(payloadRecord);
    }

    // Load or get cached proto root
    const root = await loadProtoRoot(protoFile);
    if (root === undefined) {
      return ok(payloadRecord);
    }

    // Lookup the message type
    const MessageType = root.lookupType(typeName);

    // Decode the buffer
    const decoded = MessageType.decode(value);

    // Convert to plain object
    const decodedObj = MessageType.toObject(decoded, {
      longs: String,
      enums: String,
      bytes: String,
      defaults: false,
      arrays: true,
      objects: true,
      oneofs: true,
    });

    // Verify the result is record-like
    if (!isRecordLike(decodedObj)) {
      return ok(payloadRecord); // Fallback to original if decode failed
    }

    // We've verified decodedObj is a record-like object
    return ok(decodedObj as Record<string, unknown>);
  } catch (error) {
    // If decoding fails, return error but don't crash
    return err(error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * Determines which proto file to load based on the message type
 */
function getProtoFileForType(typeName: string): string | undefined {
  if (typeName.startsWith('google.cloud.audit.')) {
    return 'google/cloud/audit/audit_log.proto';
  }
  if (typeName.startsWith('google.rpc.')) {
    return 'google/rpc/status.proto';
  }
  if (typeName.startsWith('google.protobuf.')) {
    return 'google/protobuf/any.proto';
  }
  // Add more mappings as needed
  return undefined;
}

/**
 * Loads a proto file and caches the root
 */
async function loadProtoRoot(protoFile: string): Promise<protobuf.Root | undefined> {
  const cached = protoCache.get(protoFile);
  if (cached !== undefined) {
    return cached;
  }

  try {
    const protoPath = getProtoPath(protoFile);
    const root = await protobuf.load(protoPath);
    protoCache.set(protoFile, root);
    return root;
  } catch (error) {
    // Proto file not found or failed to load
    return undefined;
  }
}
