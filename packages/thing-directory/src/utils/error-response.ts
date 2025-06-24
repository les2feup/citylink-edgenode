/**
 * Creates a standardized problem+json error response.
 * @param description A human-readable explanation of the error.
 * @param status The HTTP status code for the error.
 * @returns A Response object with application/problem+json content type.
 */
export function errorResponse(description: string, status: number): Response {
  return new Response(description, {
    status,
    headers: { "Content-Type": "application/problem+json" },
  });
}
