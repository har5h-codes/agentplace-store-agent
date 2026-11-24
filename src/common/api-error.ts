/**
 * Every error the API returns has the same shape:
 *
 *   { "error": { "code", "message", "agent_hint", "field"? }, "request_id" }
 *
 * - `code`       stable, machine-readable; the agent can branch on it.
 * - `message`    safe to repeat to the customer word for word.
 * - `agent_hint` tells the agent what to do next (ask again, offer a handoff, don't guess).
 * - `field`      which parameter was wrong, for validation errors.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly agentHint: string,
    readonly field?: string,
  ) {
    super(message);
  }

  static invalidParameter(field: string, message: string, agentHint: string) {
    return new ApiError(400, 'INVALID_PARAMETER', message, agentHint, field);
  }

  static unauthorized() {
    return new ApiError(
      401,
      'UNAUTHORIZED',
      "I can't reach the store system right now.",
      'The API key is missing or invalid. This is a configuration problem, not something the customer did. Do not retry; apologise and offer to connect them with the store team.',
    );
  }

  static missingScope(scope: string) {
    return new ApiError(
      403,
      'FORBIDDEN',
      "I'm not able to look that up for you.",
      `This API key is not allowed to use "${scope}". Do not retry or guess the answer; tell the customer you can't check this and offer to connect them with the store team.`,
    );
  }

  static serviceUnavailable() {
    return new ApiError(
      503,
      'SERVICE_UNAVAILABLE',
      'Our store system is temporarily unavailable.',
      'Apologise and ask the customer to try again in a few minutes. Do not guess stock levels or order details.',
    );
  }
}
