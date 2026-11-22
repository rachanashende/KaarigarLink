import type { ErrorRequestHandler, RequestHandler } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { ApiError } from '../utils/ApiError';
import { env } from '../config/env';

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(ApiError.notFound(`Route not found: ${req.method} ${req.originalUrl}`));
};

/** Converts every thrown error into { success: false, message, errors? }. */
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  let status = 500;
  let message = 'Internal server error';
  let errors: unknown;

  if (err instanceof ApiError) {
    status = err.statusCode;
    message = err.message;
    errors = err.errors;
  } else if (err instanceof ZodError) {
    status = 400;
    message = 'Validation failed';
    errors = err.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
  } else if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      status = 409;
      message = 'A record with these details already exists';
    } else if (err.code === 'P2025') {
      status = 404;
      message = 'Resource not found';
    } else if (err.code === 'P2003') {
      status = 400;
      message = 'Related resource does not exist';
    }
  } else if (err?.type === 'entity.parse.failed') {
    status = 400;
    message = 'Malformed JSON in request body';
  } else if (err?.type === 'entity.too.large') {
    // Body parser size limits (JSON bodies and raw file uploads).
    status = 413;
    message = 'Request body is too large';
  }

  if (status >= 500 && !env.isTest) {
    // eslint-disable-next-line no-console
    console.error(err);
  }

  res.status(status).json({
    success: false,
    message,
    ...(errors !== undefined && { errors }),
    ...(status >= 500 && !env.isProduction && err instanceof Error && { stack: err.stack }),
  });
};
