import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createApp, repositoryFromEnv } from '../src/create-app';
import { ApiError } from '../src/common/api-error';
import { StoreRepository } from '../src/store/store.types';

const AGENT_KEY = 'test_agent_key';
const STOCK_ONLY_KEY = 'test_stock_only_key';
const auth = { Authorization: `Bearer ${AGENT_KEY}` };

let app: INestApplication;
let http: ReturnType<typeof request>;

beforeAll(async () => {
  app = await createApp(repositoryFromEnv({ AGENT_API_KEY: AGENT_KEY, STOCK_ONLY_API_KEY: STOCK_ONLY_KEY }));
  await app.init();
  http = request(app.getHttpServer());
  jest.spyOn(console, 'log').mockImplementation(() => {});
});

afterAll(() => app.close());

function expectError(body: any, code: string) {
  expect(body.error.code).toBe(code);
  expect(typeof body.error.message).toBe('string');
  expect(typeof body.error.agent_hint).toBe('string');
  expect(typeof body.request_id).toBe('string');
}

describe('public routes', () => {
  it('serves health without a key', async () => {
    await http.get('/health').expect(200, { status: 'ok' });
  });

  it('serves the OpenAPI document with the request host as server', async () => {
    const res = await http.get('/openapi.json').set('Host', 'api.example.test').expect(200);
    expect(res.body.openapi).toBe('3.1.0');
    expect(res.body.servers[0].url).toBe('http://api.example.test');
    expect(Object.keys(res.body.paths)).toEqual(['/v1/stock/{sku}', '/v1/orders/{orderId}']);
  });

  it('returns the error shape for unknown routes', async () => {
    const res = await http.get('/v1/nope').set(auth).expect(404);
    expectError(res.body, 'ROUTE_NOT_FOUND');
  });
});

describe('authorization', () => {
  it('refuses a request with no key', async () => {
    const res = await http.get('/v1/stock/RDG-1001').expect(401);
    expectError(res.body, 'UNAUTHORIZED');
  });

  it('refuses a wrong key', async () => {
    const res = await http.get('/v1/stock/RDG-1001').set('Authorization', 'Bearer wrong').expect(401);
    expectError(res.body, 'UNAUTHORIZED');
  });

  it('accepts the key in X-API-Key too', async () => {
    await http.get('/v1/stock/RDG-1001').set('X-API-Key', AGENT_KEY).expect(200);
  });

  it('refuses a key without the needed scope', async () => {
    await http.get('/v1/stock/RDG-1001').set('X-API-Key', STOCK_ONLY_KEY).expect(200);
    const res = await http
      .get('/v1/orders/ORD-10002?email=liam.chen@example.com')
      .set('X-API-Key', STOCK_ONLY_KEY)
      .expect(403);
    expectError(res.body, 'FORBIDDEN');
  });

  it('echoes a request id header', async () => {
    const res = await http.get('/health').set('X-Request-Id', 'abc-123');
    expect(res.headers['x-request-id']).toBe('abc-123');
  });
});

describe('GET /v1/stock/:sku', () => {
  it('returns an in-stock product', async () => {
    const res = await http.get('/v1/stock/RDG-1001').set(auth).expect(200);
    expect(res.body).toMatchObject({
      sku: 'RDG-1001',
      availability: 'in_stock',
      quantity_available: 12,
      price: { amount: '189.00', currency: 'USD', display: '$189.00' },
      customer_summary: 'Summit Shell Jacket (Blue, M) is in stock.',
    });
  });

  it('flags low stock', async () => {
    const res = await http.get('/v1/stock/RDG-1007').set(auth).expect(200);
    expect(res.body.availability).toBe('low_stock');
    expect(res.body.customer_summary).toContain('only 1 left');
  });

  it('gives the restock date when out of stock', async () => {
    const res = await http.get('/v1/stock/RDG-1002').set(auth).expect(200);
    expect(res.body).toMatchObject({ availability: 'out_of_stock', restock_date: '2026-12-08' });
    expect(res.body.customer_summary).toContain('Tuesday, December 8');
  });

  it('says when no restock is scheduled', async () => {
    const res = await http.get('/v1/stock/RDG-1005').set(auth).expect(200);
    expect(res.body.customer_summary).toContain('no restock date');
  });

  it.each(['rdg-1004', 'RDG1004', ' RDG 1004 '])('normalises %p', async (sku) => {
    const res = await http.get(`/v1/stock/${encodeURIComponent(sku)}`).set(auth).expect(200);
    expect(res.body.sku).toBe('RDG-1004');
  });

  it('returns 404 for an unknown product', async () => {
    const res = await http.get('/v1/stock/RDG-9999').set(auth).expect(404);
    expectError(res.body, 'PRODUCT_NOT_FOUND');
  });

  it.each(['blue-jacket', '1001', 'RDG-10', "RDG-1001' OR 1=1"])('rejects malformed SKU %p', async (sku) => {
    const res = await http.get(`/v1/stock/${encodeURIComponent(sku)}`).set(auth).expect(400);
    expectError(res.body, 'INVALID_PARAMETER');
    expect(res.body.error.field).toBe('sku');
  });
});

describe('GET /v1/orders/:orderId', () => {
  it('returns a shipped order with tracking', async () => {
    const res = await http.get('/v1/orders/ORD-10002?email=liam.chen@example.com').set(auth).expect(200);
    expect(res.body).toMatchObject({
      order_id: 'ORD-10002',
      status: 'shipped',
      status_label: 'Shipped',
      total: { amount: '313.00' },
      shipping: { carrier: 'UPS', tracking_number: '1Z999AA10123456784', estimated_delivery: '2026-11-26' },
    });
    expect(res.body.items).toHaveLength(2);
    expect(res.body.customer_summary).toBe(
      'Order ORD-10002 shipped with UPS (tracking 1Z999AA10123456784). Estimated delivery is Thursday, November 26.',
    );
    expect(JSON.stringify(res.body)).not.toContain('liam.chen');
  });

  it('matches email case-insensitively and normalises the order number', async () => {
    const res = await http.get('/v1/orders/%2310003?email=%20Sofia.Patel@Example.com%20').set(auth).expect(200);
    expect(res.body.order_id).toBe('ORD-10003');
    expect(res.body.customer_summary).toBe('Order ORD-10003 was delivered on Friday, November 13.');
  });

  it('refuses when the email does not match, without revealing the order', async () => {
    const res = await http.get('/v1/orders/ORD-10002?email=someone.else@example.com').set(auth).expect(403);
    expectError(res.body, 'ORDER_VERIFICATION_FAILED');
    expect(JSON.stringify(res.body)).not.toMatch(/UPS|shipped|Tent/i);
  });

  it('returns 404 for an unknown order', async () => {
    const res = await http.get('/v1/orders/ORD-99999?email=liam.chen@example.com').set(auth).expect(404);
    expectError(res.body, 'ORDER_NOT_FOUND');
  });

  it('rejects a malformed order id', async () => {
    const res = await http.get('/v1/orders/ORD-12?email=liam.chen@example.com').set(auth).expect(400);
    expectError(res.body, 'INVALID_PARAMETER');
    expect(res.body.error.field).toBe('order_id');
  });

  it('asks for the email when it is missing', async () => {
    const res = await http.get('/v1/orders/ORD-10002').set(auth).expect(400);
    expect(res.body.error.field).toBe('email');
    expect(res.body.error.message).toContain('email address');
  });

  it('rejects a malformed email', async () => {
    const res = await http.get('/v1/orders/ORD-10002?email=liam.chen@').set(auth).expect(400);
    expect(res.body.error.field).toBe('email');
  });

  it.each([
    ['ORD-10001', 'maya.reyes@example.com', "hasn't shipped yet"],
    ['ORD-10004', 'noah.kim@example.com', 'out for delivery'],
    ['ORD-10005', 'emma.lopez@example.com', 'cancelled'],
    ['ORD-10006', 'oliver.brown@example.com', 'on hold'],
    ['ORD-10007', 'ava.nguyen@example.com', 'refunded'],
  ])('summarises %s', async (id, email, phrase) => {
    const res = await http.get(`/v1/orders/${id}?email=${email}`).set(auth).expect(200);
    expect(res.body.customer_summary).toContain(phrase);
  });
});

describe('failures inside the service', () => {
  it('turns a storage outage into a 503 the agent can explain', async () => {
    const down: StoreRepository = {
      findApiClientByKeyHash: async () => ({ id: '1', name: 'store-agent', scopes: ['stock:read', 'orders:read'] }),
      findProductBySku: async () => {
        throw ApiError.serviceUnavailable();
      },
      findOrderById: async () => {
        throw new Error('connection reset: secret internal detail');
      },
    };
    const broken = await createApp(down);
    await broken.init();
    jest.spyOn(console, 'error').mockImplementation(() => {});

    const stock = await request(broken.getHttpServer()).get('/v1/stock/RDG-1001').set(auth).expect(503);
    expectError(stock.body, 'SERVICE_UNAVAILABLE');

    const order = await request(broken.getHttpServer())
      .get('/v1/orders/ORD-10001?email=maya.reyes@example.com')
      .set(auth)
      .expect(500);
    expectError(order.body, 'INTERNAL_ERROR');
    expect(JSON.stringify(order.body)).not.toContain('secret internal detail');
    await broken.close();
  });
});
