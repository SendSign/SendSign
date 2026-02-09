/**
 * CoSeal SDK error classes.
 * @module @coseal/sdk
 */

/**
 * Base error class for all CoSeal SDK errors.
 */
export class CoSealError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode?: number,
  ) {
    super(message);
    this.name = 'CoSealError';
  }
}

/**
 * Thrown when API authentication fails.
 */
export class AuthenticationError extends CoSealError {
  constructor(message: string = 'Invalid or missing API key') {
    super(message, 'AUTHENTICATION_ERROR', 401);
    this.name = 'AuthenticationError';
  }
}

/**
 * Thrown when a requested resource is not found.
 */
export class NotFoundError extends CoSealError {
  constructor(resource: string, id: string) {
    super(`${resource} not found: ${id}`, 'NOT_FOUND', 404);
    this.name = 'NotFoundError';
  }
}

/**
 * Thrown when the request payload is invalid.
 */
export class ValidationError extends CoSealError {
  constructor(
    message: string,
    public readonly details?: Record<string, string[]>,
  ) {
    super(message, 'VALIDATION_ERROR', 400);
    this.name = 'ValidationError';
  }
}

/**
 * Thrown when rate limit is exceeded.
 */
export class RateLimitError extends CoSealError {
  constructor(
    public readonly retryAfter?: number,
  ) {
    super(
      `Rate limit exceeded${retryAfter ? `. Retry after ${retryAfter} seconds` : ''}`,
      'RATE_LIMIT_ERROR',
      429,
    );
    this.name = 'RateLimitError';
  }
}

/**
 * Thrown when the server returns an unexpected error.
 */
export class ServerError extends CoSealError {
  constructor(message: string = 'Internal server error') {
    super(message, 'SERVER_ERROR', 500);
    this.name = 'ServerError';
  }
}

/**
 * Thrown when a network request times out.
 */
export class TimeoutError extends CoSealError {
  constructor(timeoutMs: number) {
    super(`Request timed out after ${timeoutMs}ms`, 'TIMEOUT_ERROR');
    this.name = 'TimeoutError';
  }
}

/**
 * Thrown when a network error occurs.
 */
export class NetworkError extends CoSealError {
  constructor(message: string = 'Network error') {
    super(message, 'NETWORK_ERROR');
    this.name = 'NetworkError';
  }
}
