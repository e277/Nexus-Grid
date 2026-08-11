/**
 * Request-body validation. Every failure raises a 422 with a readable
 * `detail` string, which is what the client renders.
 */

import { HttpError } from "./http";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

type Body = Record<string, unknown>;

export function requiredString(body: Body, field: string): string {
  const value = body[field];
  if (typeof value !== "string" || value.trim() === "") {
    throw new HttpError(422, `${field} is required`);
  }
  return value;
}

export function optionalString(body: Body, field: string): string | null {
  const value = body[field];
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") throw new HttpError(422, `${field} must be a string`);
  return value;
}

interface IntBounds {
  /** Minimum allowed value, inclusive. */
  ge?: number;
  /** Minimum allowed value, exclusive. */
  gt?: number;
}

export function requiredInt(body: Body, field: string, bounds: IntBounds = {}): number {
  const value = body[field];
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new HttpError(422, `${field} must be an integer`);
  }
  checkBounds(field, value, bounds);
  return value;
}

export function optionalInt(
  body: Body,
  field: string,
  bounds: IntBounds = {}
): number | null {
  const value = body[field];
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new HttpError(422, `${field} must be an integer`);
  }
  checkBounds(field, value, bounds);
  return value;
}

function checkBounds(field: string, value: number, { ge, gt }: IntBounds): void {
  if (ge !== undefined && value < ge) {
    throw new HttpError(422, `${field} must be greater than or equal to ${ge}`);
  }
  if (gt !== undefined && value <= gt) {
    throw new HttpError(422, `${field} must be greater than ${gt}`);
  }
}

export function optionalBool(body: Body, field: string, fallback: boolean): boolean {
  const value = body[field];
  if (value === undefined || value === null) return fallback;
  if (typeof value !== "boolean") throw new HttpError(422, `${field} must be a boolean`);
  return value;
}

/** An enum-valued field with a default when omitted. */
export function enumField<T extends string>(
  body: Body,
  field: string,
  allowed: readonly T[],
  fallback: T
): T {
  const value = body[field];
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new HttpError(422, `${field} must be one of: ${allowed.join(", ")}`);
  }
  return value as T;
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

/** A calendar date as `YYYY-MM-DD`. */
export function optionalDate(body: Body, field: string): string | null {
  const value = optionalString(body, field);
  if (value === null) return null;
  const date = value.slice(0, 10);
  if (!ISO_DATE.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) {
    throw new HttpError(422, `${field} must be a date in YYYY-MM-DD format`);
  }
  return date;
}

/** A timestamp, normalized to ISO-8601 with a `Z` suffix. */
export function optionalDateTime(body: Body, field: string): string | null {
  const value = optionalString(body, field);
  if (value === null) return null;
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    throw new HttpError(422, `${field} must be a valid date-time`);
  }
  return new Date(parsed).toISOString().replace(/\.\d{3}Z$/, "Z");
}

/** RFC-5322-lite email check. */
export function requiredEmail(body: Body, field: string): string {
  const value = requiredString(body, field);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) {
    throw new HttpError(422, `${field} must be a valid email address`);
  }
  return value;
}
