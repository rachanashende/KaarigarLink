import type { NextFunction, Request, Response } from 'express';
import type { ZodTypeAny } from 'zod';

interface Schemas {
  body?: ZodTypeAny;
  params?: ZodTypeAny;
  query?: ZodTypeAny;
}

/**
 * Validates and sanitises request parts with zod. On success the parsed
 * (coerced, defaulted, stripped) values replace the originals. ZodErrors are
 * forwarded to the error handler, which returns a 400 with field details.
 */
export const validate =
  (schemas: Schemas) => (req: Request, _res: Response, next: NextFunction) => {
    if (schemas.body) req.body = schemas.body.parse(req.body ?? {});
    if (schemas.params) req.params = schemas.params.parse(req.params);
    if (schemas.query) {
      // Express 5 exposes req.query as a getter, so redefine it.
      Object.defineProperty(req, 'query', {
        value: schemas.query.parse(req.query),
        writable: true,
        configurable: true,
      });
    }
    next();
  };
