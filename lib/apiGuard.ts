/**
 * ARCH-05: API request guards — body size limits & standardized error responses.
 *
 * Provides reusable utilities for:
 * - Request body size validation (prevents abuse / DoS)
 * - Consistent JSON error response formatting
 */

/** Maximum request body sizes per endpoint type (in bytes) */
export const BODY_SIZE_LIMITS = {
  /** Chat messages: 512 KB (large prompts + conversation history) */
  chat: 512 * 1024,
  /** Evaluate/Fix: 2 MB (full repo file contents) */
  code: 2 * 1024 * 1024,
  /** Deploy: 5 MB (all generated files) */
  deploy: 5 * 1024 * 1024,
  /** Orchestrate: 2 MB (existing files + prompt) */
  orchestrate: 2 * 1024 * 1024,
  /** Default: 1 MB */
  default: 1 * 1024 * 1024,
} as const;

/**
 * Validate Content-Length header against a size limit.
 * Returns null if valid, or a 413 Response if too large.
 *
 * NOTE: Content-Length is advisory and may not be present on all requests.
 * This is a first-pass guard — actual body parsing may still fail for
 * chunked transfers that exceed limits.
 */
export function checkBodySize(
  headers: Headers,
  maxBytes: number,
): Response | null {
  const contentLength = headers.get('content-length');
  if (contentLength) {
    const size = parseInt(contentLength, 10);
    if (!isNaN(size) && size > maxBytes) {
      return Response.json(
        {
          error: 'Request body too large',
          maxBytes,
          receivedBytes: size,
        },
        { status: 413 },
      );
    }
  }
  return null;
}

/**
 * Build a standardised JSON error response.
 * All API errors go through this to ensure consistent shape.
 */
export function apiError(
  message: string,
  status: number,
  extra?: Record<string, unknown>,
): Response {
  return Response.json(
    { error: message, ...extra },
    { status },
  );
}

/**
 * Wrap an async handler with a top-level try/catch that returns a
 * standardised 500 response instead of crashing the Worker.
 */
export function withErrorBoundary(
  handler: (request: Request) => Promise<Response>,
): (request: Request) => Promise<Response> {
  return async (request: Request) => {
    try {
      return await handler(request);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Internal server error';
      console.error('[API Error Boundary]', message, err);
      return apiError(message, 500);
    }
  };
}
