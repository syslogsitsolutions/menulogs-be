/**
 * Serialization Utilities
 * 
 * Utilities for serializing data types that can't be directly JSON stringified.
 * 
 * @module utils/serialization
 */

/**
 * Convert BigInt values to strings recursively
 * This is needed because JSON.stringify doesn't support BigInt
 */
export function serializeBigInt<T>(obj: T): T {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === 'bigint') {
    return obj.toString() as unknown as T;
  }

  if (Array.isArray(obj)) {
    return obj.map(serializeBigInt) as unknown as T;
  }

  if (typeof obj === 'object') {
    const result: any = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = serializeBigInt(value);
    }
    return result as T;
  }

  return obj;
}

/**
 * Convert location object to safe JSON format
 * Converts BigInt fields to strings
 */
export function serializeLocation(location: any): any {
  if (!location) {
    return location;
  }

  const serialized = { ...location };
  
  // Convert BigInt fields to strings
  if (serialized.currentStorageBytes !== undefined && serialized.currentStorageBytes !== null) {
    serialized.currentStorageBytes = serialized.currentStorageBytes.toString();
  }

  return serialized;
}

/**
 * Convert array of locations to safe JSON format
 */
export function serializeLocations(locations: any[]): any[] {
  return locations.map(serializeLocation);
}


