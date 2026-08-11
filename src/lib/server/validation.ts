/**
 * Request-body validation. Every failure raises a 422 with a readable
 * `detail` string, which is what the client renders.
 */

import { HttpError } from "./http";

type Body = Record<string, unknown>;

export function optionalString(body: Body, field: string): string | null {
  const value = body[field];
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") throw new HttpError(422, `${field} must be a string`);
  return value;
}

export function optionalInt(body: Body, field: string): number | null {
  const value = body[field];
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new HttpError(422, `${field} must be an integer`);
  }
  return value;
}

export function optionalBool(body: Body, field: string, fallback: boolean): boolean {
  const value = body[field];
  if (value === undefined || value === null) return fallback;
  if (typeof value !== "boolean") throw new HttpError(422, `${field} must be a boolean`);
  return value;
}

/** An enum-valued field with no default — the caller must supply it. */
export function requiredEnum<T extends string>(
  body: Body,
  field: string,
  allowed: readonly T[]
): T {
  const value = body[field];
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new HttpError(422, `${field} must be one of: ${allowed.join(", ")}`);
  }
  return value as T;
}
