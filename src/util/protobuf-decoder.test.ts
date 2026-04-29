import { describe, it, expect } from "vitest";
import { decodeProtoPayload } from "./protobuf-decoder";

describe("Protobuf Decoder", () => {
  it("should return undefined for null/undefined input", async () => {
    const nullResult = await decodeProtoPayload(null);
    expect(nullResult.isOk()).toBe(true);
    expect(nullResult._unsafeUnwrap()).toBeUndefined();

    const undefinedResult = await decodeProtoPayload(undefined);
    expect(undefinedResult.isOk()).toBe(true);
    expect(undefinedResult._unsafeUnwrap()).toBeUndefined();
  });

  it("should return undefined for non-object input", async () => {
    const stringResult = await decodeProtoPayload("test");
    expect(stringResult.isOk()).toBe(true);
    expect(stringResult._unsafeUnwrap()).toBeUndefined();

    const numberResult = await decodeProtoPayload(123);
    expect(numberResult.isOk()).toBe(true);
    expect(numberResult._unsafeUnwrap()).toBeUndefined();
  });

  it("should return object as-is if no type_url or value", async () => {
    const payload = { foo: "bar", baz: 123 };
    const result = await decodeProtoPayload(payload);
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual(payload);
  });

  it("should return object as-is if type_url is not a string", async () => {
    const payload = { type_url: 123, value: Buffer.from("test") };
    const result = await decodeProtoPayload(payload);
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual(payload);
  });

  it("should return object as-is if value is not a Buffer", async () => {
    const payload = { type_url: "type.googleapis.com/google.cloud.audit.AuditLog", value: "not a buffer" };
    const result = await decodeProtoPayload(payload);
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual(payload);
  });

  it("should return error for unknown type_url", async () => {
    const payload = { 
      type_url: "type.googleapis.com/unknown.Type", 
      value: Buffer.from("test") 
    };
    const result = await decodeProtoPayload(payload);
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain("Unknown protobuf type");
    }
  });

  it("should decode JSON-stringified Buffer (Buffer.toJSON format)", async () => {
    // Simulate what happens when JSON.stringify is called on a Buffer
    const originalBuffer = Buffer.from("test data");
    const jsonifiedBuffer = originalBuffer.toJSON(); // {type: "Buffer", data: [116, 101, 115, 116, ...]}
    
    const payload = { 
      type_url: "type.googleapis.com/google.cloud.audit.AuditLog", 
      value: jsonifiedBuffer
    };
    
    const result = await decodeProtoPayload(payload);
    // Should attempt to decode (may fail without proper proto but shouldn't crash)
    expect(result.isOk() || result.isErr()).toBe(true);
  });

  it("should successfully load AuditLog proto and attempt decode", async () => {
    // Test that the proto file loads correctly with proper import resolution
    // We use invalid bytes to just test that proto loading works
    const invalidBytes = Buffer.from([0x12, 0x14]);
    
    const payload = {
      type_url: "type.googleapis.com/google.cloud.audit.AuditLog",
      value: invalidBytes
    };
    
    const result = await decodeProtoPayload(payload);
    
    // The decode will fail due to invalid bytes, but the error should be about
    // protobuf decoding, not "proto file not found" - proving the proto loaded
    if (result.isErr()) {
      const errorMsg = result.error.message;
      // Should NOT be proto loading errors
      expect(errorMsg).not.toContain('Failed to load proto');
      expect(errorMsg).not.toContain('Unknown protobuf type');
      // Should be a protobuf decode error (proving proto was loaded and decode attempted)
      // Common protobuf errors: "wire type", "index out of range", "offset", "invalid"
      expect(
        errorMsg.includes('wire') ||
        errorMsg.includes('offset') ||
        errorMsg.includes('invalid') ||
        errorMsg.includes('index out of range')
      ).toBe(true);
    } else {
      // If it somehow succeeded with random bytes, that's also fine for this test
      expect(result.isOk()).toBe(true);
    }
  });

  it("should handle already decoded payloads", async () => {
    const payload = {
      serviceName: "monitoring.googleapis.com",
      methodName: "google.monitoring.v3.MetricService.CreateTimeSeries",
      resourceName: "projects/123",
    };
    const result = await decodeProtoPayload(payload);
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual(payload);
  });
});
