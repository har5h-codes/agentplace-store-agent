import { Order, Product } from './store.types';

/**
 * Sample catalog and orders for "Ridgeline Outfitters", an outdoor gear store.
 * The same data seeds Postgres (src/scripts/seed.ts) and backs the in-memory repository.
 * Each record is chosen to exercise a different answer path for the agent.
 */
export const PRODUCTS: Product[] = [
  { sku: 'RDG-1001', name: 'Summit Shell Jacket', variant: 'Blue, M', category: 'Jackets', priceCents: 18900, currency: 'USD', quantityAvailable: 12, restockDate: null },
  { sku: 'RDG-1002', name: 'Summit Shell Jacket', variant: 'Blue, L', category: 'Jackets', priceCents: 18900, currency: 'USD', quantityAvailable: 0, restockDate: '2026-12-08' },
  { sku: 'RDG-1003', name: 'Summit Shell Jacket', variant: 'Black, M', category: 'Jackets', priceCents: 18900, currency: 'USD', quantityAvailable: 3, restockDate: null },
  { sku: 'RDG-1004', name: 'Trailhead 2-Person Tent', variant: null, category: 'Tents', priceCents: 24900, currency: 'USD', quantityAvailable: 7, restockDate: null },
  { sku: 'RDG-1005', name: 'Basecamp 4-Person Tent', variant: null, category: 'Tents', priceCents: 42900, currency: 'USD', quantityAvailable: 0, restockDate: null },
  { sku: 'RDG-1006', name: 'Ridgeline Hiking Boots', variant: 'Brown, US 10', category: 'Footwear', priceCents: 15900, currency: 'USD', quantityAvailable: 5, restockDate: null },
  { sku: 'RDG-1007', name: 'Ridgeline Hiking Boots', variant: 'Brown, US 9', category: 'Footwear', priceCents: 15900, currency: 'USD', quantityAvailable: 1, restockDate: null },
  { sku: 'RDG-1008', name: 'Alpine 30L Daypack', variant: 'Green', category: 'Packs', priceCents: 9500, currency: 'USD', quantityAvailable: 20, restockDate: null },
  { sku: 'RDG-1009', name: 'Merino Base Layer Top', variant: 'Grey, S', category: 'Base layers', priceCents: 6800, currency: 'USD', quantityAvailable: 15, restockDate: null },
  { sku: 'RDG-1010', name: 'Insulated Water Bottle 1L', variant: 'Silver', category: 'Accessories', priceCents: 3200, currency: 'USD', quantityAvailable: 40, restockDate: null },
];

const item = (sku: string, quantity: number) => {
  const p = PRODUCTS.find((x) => x.sku === sku)!;
  const name = p.variant ? `${p.name} (${p.variant})` : p.name;
  return { sku, name, quantity, unitPriceCents: p.priceCents };
};

const order = (o: Partial<Order> & Pick<Order, 'orderId' | 'customerEmail' | 'status' | 'placedAt' | 'items'>): Order => ({
  currency: 'USD',
  carrier: null,
  trackingNumber: null,
  shippedAt: null,
  estimatedDelivery: null,
  deliveredAt: null,
  ...o,
});

export const ORDERS: Order[] = [
  order({ orderId: 'ORD-10001', customerEmail: 'maya.reyes@example.com', status: 'processing', placedAt: '2026-11-22T14:05:00Z', estimatedDelivery: '2026-12-01', items: [item('RDG-1001', 1)] }),
  order({ orderId: 'ORD-10002', customerEmail: 'liam.chen@example.com', status: 'shipped', placedAt: '2026-11-18T09:30:00Z', carrier: 'UPS', trackingNumber: '1Z999AA10123456784', shippedAt: '2026-11-20T16:00:00Z', estimatedDelivery: '2026-11-26', items: [item('RDG-1004', 1), item('RDG-1010', 2)] }),
  order({ orderId: 'ORD-10003', customerEmail: 'sofia.patel@example.com', status: 'delivered', placedAt: '2026-11-08T11:12:00Z', carrier: 'FedEx', trackingNumber: '771234567890', shippedAt: '2026-11-10T13:00:00Z', estimatedDelivery: '2026-11-14', deliveredAt: '2026-11-13T15:42:00Z', items: [item('RDG-1006', 1)] }),
  order({ orderId: 'ORD-10004', customerEmail: 'noah.kim@example.com', status: 'out_for_delivery', placedAt: '2026-11-17T18:45:00Z', carrier: 'USPS', trackingNumber: '9400111899223344556677', shippedAt: '2026-11-19T10:00:00Z', estimatedDelivery: '2026-11-24', items: [item('RDG-1008', 1), item('RDG-1009', 2)] }),
  order({ orderId: 'ORD-10005', customerEmail: 'emma.lopez@example.com', status: 'cancelled', placedAt: '2026-11-15T08:20:00Z', items: [item('RDG-1005', 1)] }),
  order({ orderId: 'ORD-10006', customerEmail: 'oliver.brown@example.com', status: 'on_hold', placedAt: '2026-11-23T21:10:00Z', items: [item('RDG-1003', 1), item('RDG-1007', 1)] }),
  order({ orderId: 'ORD-10007', customerEmail: 'ava.nguyen@example.com', status: 'refunded', placedAt: '2026-10-30T12:00:00Z', carrier: 'UPS', trackingNumber: '1Z999AA10987654321', shippedAt: '2026-11-01T09:00:00Z', deliveredAt: '2026-11-04T17:30:00Z', items: [item('RDG-1002', 1)] }),
  order({ orderId: 'ORD-10008', customerEmail: 'lucas.martin@example.com', status: 'shipped', placedAt: '2026-11-19T07:55:00Z', carrier: 'FedEx', trackingNumber: '779876543210', shippedAt: '2026-11-21T12:30:00Z', estimatedDelivery: '2026-11-25', items: [item('RDG-1001', 1), item('RDG-1009', 1)] }),
  order({ orderId: 'ORD-10009', customerEmail: 'mia.wilson@example.com', status: 'delivered', placedAt: '2026-11-02T16:40:00Z', carrier: 'USPS', trackingNumber: '9400111899221122334455', shippedAt: '2026-11-04T11:00:00Z', estimatedDelivery: '2026-11-08', deliveredAt: '2026-11-07T10:05:00Z', items: [item('RDG-1010', 3)] }),
  order({ orderId: 'ORD-10010', customerEmail: 'ethan.davis@example.com', status: 'processing', placedAt: '2026-11-24T06:15:00Z', estimatedDelivery: '2026-12-03', items: [item('RDG-1004', 1), item('RDG-1008', 1)] }),
];
