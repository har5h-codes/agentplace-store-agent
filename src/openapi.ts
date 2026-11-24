/** OpenAPI 3.1 description of the API, served at /openapi.json so agent builders can import it. */
export function openApiSpec(baseUrl: string) {
  const error = { $ref: '#/components/responses/Error' };
  return {
    openapi: '3.1.0',
    info: {
      title: 'Ridgeline Outfitters Store API',
      version: '1.0.0',
      description:
        'Live stock levels and order status for the Ridgeline Outfitters store agent. Every response includes a ' +
        '`customer_summary` (success) or `error.message` (failure) that is safe to repeat to the customer, and ' +
        'errors include an `agent_hint` that says what to do next.',
    },
    servers: [{ url: baseUrl }],
    security: [{ bearerAuth: [] }, { apiKeyHeader: [] }],
    paths: {
      '/v1/stock/{sku}': {
        get: {
          operationId: 'getStockLevel',
          summary: 'Check whether a product is in stock',
          description: 'Requires the `stock:read` scope. Look up the SKU by product name in the catalog first.',
          parameters: [
            { name: 'sku', in: 'path', required: true, description: 'Product code, e.g. RDG-1001', schema: { type: 'string', pattern: '^[A-Za-z]{3}-?\\d{4}$' } },
          ],
          responses: {
            '200': { description: 'Stock level', content: { 'application/json': { schema: { $ref: '#/components/schemas/Stock' } } } },
            '400': error, '401': error, '403': error, '404': error, '503': error,
          },
        },
      },
      '/v1/orders/{orderId}': {
        get: {
          operationId: 'getOrderStatus',
          summary: "Get an order's status",
          description: 'Requires the `orders:read` scope. The email must match the one used for the order, otherwise the API refuses with 403.',
          parameters: [
            { name: 'orderId', in: 'path', required: true, description: 'Order number, e.g. ORD-10001', schema: { type: 'string' } },
            { name: 'email', in: 'query', required: true, description: 'Email address used at checkout', schema: { type: 'string', format: 'email' } },
          ],
          responses: {
            '200': { description: 'Order status', content: { 'application/json': { schema: { $ref: '#/components/schemas/Order' } } } },
            '400': error, '401': error, '403': error, '404': error, '503': error,
          },
        },
      },
    },
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer' },
        apiKeyHeader: { type: 'apiKey', in: 'header', name: 'X-API-Key' },
      },
      responses: {
        Error: { description: 'Error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
      },
      schemas: {
        Money: {
          type: 'object',
          properties: { amount: { type: 'string', example: '189.00' }, currency: { type: 'string', example: 'USD' }, display: { type: 'string', example: '$189.00' } },
        },
        Stock: {
          type: 'object',
          properties: {
            sku: { type: 'string' },
            name: { type: 'string' },
            variant: { type: ['string', 'null'] },
            price: { $ref: '#/components/schemas/Money' },
            availability: { type: 'string', enum: ['in_stock', 'low_stock', 'out_of_stock'] },
            quantity_available: { type: 'integer' },
            restock_date: { type: ['string', 'null'], format: 'date' },
            customer_summary: { type: 'string' },
          },
        },
        Order: {
          type: 'object',
          properties: {
            order_id: { type: 'string' },
            status: { type: 'string', enum: ['processing', 'on_hold', 'shipped', 'out_for_delivery', 'delivered', 'cancelled', 'refunded'] },
            status_label: { type: 'string' },
            placed_at: { type: 'string', format: 'date-time' },
            items: { type: 'array', items: { type: 'object', properties: { sku: { type: 'string' }, name: { type: 'string' }, quantity: { type: 'integer' } } } },
            total: { $ref: '#/components/schemas/Money' },
            shipping: {
              type: 'object',
              properties: {
                carrier: { type: ['string', 'null'] },
                tracking_number: { type: ['string', 'null'] },
                shipped_at: { type: ['string', 'null'], format: 'date-time' },
                estimated_delivery: { type: ['string', 'null'], format: 'date' },
                delivered_at: { type: ['string', 'null'], format: 'date-time' },
              },
            },
            customer_summary: { type: 'string' },
          },
        },
        Error: {
          type: 'object',
          properties: {
            error: {
              type: 'object',
              properties: {
                code: { type: 'string', example: 'ORDER_VERIFICATION_FAILED' },
                message: { type: 'string', description: 'Safe to repeat to the customer.' },
                agent_hint: { type: 'string', description: 'What the agent should do next.' },
                field: { type: 'string' },
              },
            },
            request_id: { type: 'string' },
          },
        },
      },
    },
  };
}
