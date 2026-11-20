/**
 * Throw an ApiError anywhere (service, controller, middleware) and the global
 * error handler turns it into a consistent JSON error response.
 */
export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly errors?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  static badRequest(message = 'Bad request', errors?: unknown) {
    return new ApiError(400, message, errors);
  }
  static unauthorized(message = 'Authentication required') {
    return new ApiError(401, message);
  }
  static forbidden(message = 'You do not have permission to perform this action') {
    return new ApiError(403, message);
  }
  static notFound(message = 'Resource not found') {
    return new ApiError(404, message);
  }
  static conflict(message = 'Resource already exists') {
    return new ApiError(409, message);
  }
}
