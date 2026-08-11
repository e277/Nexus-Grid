/**
 * Domain errors raised by the service layer.
 *
 * Services stay free of HTTP concerns: they raise these, and the route
 * wrapper in `http.ts` maps them onto status codes (404 / 409).
 */

/** A referenced entity does not exist. */
export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}

/** A requested state change is not allowed from the current state. */
export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConflictError";
  }
}
