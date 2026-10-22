import { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError, ZodTypeAny, z } from 'zod';
import { AppError, badRequest } from '../lib/errors';
import { env } from '../config/env';

/** Parse + validate; throws a 400 with field-level details. */
export function parse<T extends ZodTypeAny>(schema: T, data: unknown): z.infer<T> {
  const result = schema.safeParse(data);
  if (!result.success) throw zodToAppError(result.error);
  return result.data;
}

function zodToAppError(err: ZodError) {
  return badRequest(
    'Validation failed',
    err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
  );
}

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: `Route ${req.method} ${req.path} not found` } });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) err = zodToAppError(err);

  if (err instanceof AppError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
    return;
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      res.status(409).json({ error: { code: 'CONFLICT', message: 'A record with these values already exists' } });
      return;
    }
    if (err.code === 'P2025') {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Record not found' } });
      return;
    }
    if (err.code === 'P2003') {
      res.status(409).json({ error: { code: 'CONFLICT', message: 'Operation blocked by related records' } });
      return;
    }
  }

  // Malformed JSON bodies from express.json()
  if (typeof err === 'object' && err && (err as { type?: string }).type === 'entity.parse.failed') {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Malformed JSON body' } });
    return;
  }

  // Anything else: log server-side, return a generic message. Never leak stack traces.
  if (env.NODE_ENV !== 'test') console.error(`[error] ${req.method} ${req.originalUrl}`, err);
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' } });
}
