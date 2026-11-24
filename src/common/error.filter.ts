import { ArgumentsHost, Catch, ExceptionFilter, HttpException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ApiError } from './api-error';

/** Turns every thrown error into the documented error shape. Internal details never reach the client. */
@Catch()
export class ErrorFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();
    const err = toApiError(exception);

    if (err.status >= 500) {
      console.error(JSON.stringify({ level: 'error', msg: 'request failed', request_id: req.id, error: String(exception) }));
    }

    res.status(err.status).json({
      error: {
        code: err.code,
        message: err.message,
        agent_hint: err.agentHint,
        ...(err.field ? { field: err.field } : {}),
      },
      request_id: req.id,
    });
  }
}

function toApiError(e: unknown): ApiError {
  if (e instanceof ApiError) return e;
  if (e instanceof HttpException) {
    const status = e.getStatus();
    if (status === 404) {
      return new ApiError(404, 'ROUTE_NOT_FOUND', "I can't look that up right now.", 'This endpoint does not exist. Check the path against /openapi.json.');
    }
    if (status === 405) {
      return new ApiError(405, 'METHOD_NOT_ALLOWED', "I can't do that right now.", 'Only GET requests are supported.');
    }
    if (status < 500) {
      return new ApiError(status, 'BAD_REQUEST', "I couldn't process that request.", 'The request was malformed. Check it against /openapi.json.');
    }
  }
  return new ApiError(
    500,
    'INTERNAL_ERROR',
    'Something went wrong on our side.',
    'Apologise and offer to connect the customer with the store team. Do not guess the answer.',
  );
}
