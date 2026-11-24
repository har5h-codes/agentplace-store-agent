import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { ApiClient } from '../store/store.types';

declare module 'express-serve-static-core' {
  interface Request {
    id: string;
    apiClient?: ApiClient;
  }
}

/**
 * Gives every request an id (echoed in the `x-request-id` header and in error bodies) and writes one
 * structured log line when it finishes. Query strings are left out of the log so customer emails
 * are never logged.
 */
export function requestContext(req: Request, res: Response, next: NextFunction) {
  const incoming = req.header('x-request-id');
  req.id = incoming && /^[\w-]{1,64}$/.test(incoming) ? incoming : randomUUID();
  res.setHeader('x-request-id', req.id);

  const started = process.hrtime.bigint();
  res.on('finish', () => {
    console.log(
      JSON.stringify({
        level: 'info',
        msg: 'request',
        request_id: req.id,
        method: req.method,
        path: req.path,
        status: res.statusCode,
        duration_ms: Number((process.hrtime.bigint() - started) / 1_000_000n),
        client: req.apiClient?.name ?? null,
      }),
    );
  });
  next();
}
