import { CanActivate, ExecutionContext, Inject, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createHash } from 'node:crypto';
import type { Request } from 'express';
import { ApiError } from '../common/api-error';
import { Scope, STORE_REPOSITORY, StoreRepository } from '../store/store.types';

const SCOPE_KEY = 'requiredScope';

/** Marks a route as needing an API key that carries this scope. */
export const RequireScope = (scope: Scope) => SetMetadata(SCOPE_KEY, scope);

export const hashApiKey = (key: string) => createHash('sha256').update(key, 'utf8').digest('hex');

/**
 * Accepts the key as `Authorization: Bearer <key>` or `X-API-Key: <key>`.
 * Keys are stored only as SHA-256 hashes, so a database leak does not leak usable keys.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(STORE_REPOSITORY) private readonly repo: StoreRepository,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const scope = this.reflector.get<Scope | undefined>(SCOPE_KEY, ctx.getHandler());
    if (!scope) return true; // public route

    const req = ctx.switchToHttp().getRequest<Request>();
    const key = extractKey(req);
    if (!key) throw ApiError.unauthorized();

    const client = await this.repo.findApiClientByKeyHash(hashApiKey(key));
    if (!client) throw ApiError.unauthorized();
    req.apiClient = client;

    if (!client.scopes.includes(scope)) throw ApiError.missingScope(scope);
    return true;
  }
}

function extractKey(req: Request): string | null {
  const auth = req.header('authorization');
  if (auth) {
    const m = /^Bearer\s+(\S+)$/i.exec(auth.trim());
    if (m) return m[1];
  }
  const headerKey = req.header('x-api-key');
  return headerKey?.trim() || null;
}
