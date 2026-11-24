import { Controller, Get, Req } from '@nestjs/common';
import type { Request } from 'express';
import { openApiSpec } from './openapi';

@Controller()
export class MetaController {
  @Get()
  index() {
    return {
      name: 'Ridgeline Outfitters Store API',
      docs: '/openapi.json',
      endpoints: ['GET /v1/stock/{sku}', 'GET /v1/orders/{orderId}?email=...'],
    };
  }

  @Get('health')
  health() {
    return { status: 'ok' };
  }

  @Get('openapi.json')
  openapi(@Req() req: Request) {
    const proto = (req.header('x-forwarded-proto') ?? req.protocol).split(',')[0];
    return openApiSpec(`${proto}://${req.get('host')}`);
  }
}
