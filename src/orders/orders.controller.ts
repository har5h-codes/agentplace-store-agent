import { Controller, Get, Inject, Param, Query } from '@nestjs/common';
import { z } from 'zod';
import { RequireScope } from '../auth/api-key.guard';
import { ApiError } from '../common/api-error';
import { humanDate, money } from '../common/format';
import { Order, OrderStatus, STORE_REPOSITORY, StoreRepository } from '../store/store.types';

/** Accepts "ORD-10001", "ord10001", "#10001" and "10001". */
const OrderIdParam = z
  .string()
  .transform((s) => {
    const t = s.trim().toUpperCase().replace(/^#/, '').replace(/\s+/g, '');
    const digits = /^(?:ORD-?)?(\d{5})$/.exec(t);
    return digits ? `ORD-${digits[1]}` : t;
  })
  .pipe(z.string().regex(/^ORD-\d{5}$/));

const EmailQuery = z.string().trim().toLowerCase().pipe(z.email());

const STATUS_LABEL: Record<OrderStatus, string> = {
  processing: 'Processing',
  on_hold: 'On hold',
  shipped: 'Shipped',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  refunded: 'Refunded',
};

@Controller('v1/orders')
export class OrdersController {
  constructor(@Inject(STORE_REPOSITORY) private readonly repo: StoreRepository) {}

  /**
   * The email works as a second factor: an order number alone (easy to guess or read off a
   * receipt) never reveals an order.
   */
  @Get(':orderId')
  @RequireScope('orders:read')
  async getOrder(@Param('orderId') rawOrderId: string, @Query('email') rawEmail?: string) {
    const orderId = OrderIdParam.safeParse(rawOrderId);
    if (!orderId.success) {
      throw ApiError.invalidParameter(
        'order_id',
        "That doesn't look like a valid order number.",
        'Order numbers look like ORD-10001 (five digits). Ask the customer to check their confirmation email and read the number again.',
      );
    }

    if (rawEmail === undefined || rawEmail.trim() === '') {
      throw ApiError.invalidParameter(
        'email',
        'I need the email address you used for the order to look it up.',
        'Ask the customer for the email address used at checkout, then call again with it in the "email" query parameter.',
      );
    }
    const email = EmailQuery.safeParse(rawEmail);
    if (!email.success) {
      throw ApiError.invalidParameter(
        'email',
        "That email address doesn't look complete.",
        'Ask the customer to repeat the email address they used at checkout.',
      );
    }

    const order = await this.repo.findOrderById(orderId.data);
    if (!order) {
      throw new ApiError(
        404,
        'ORDER_NOT_FOUND',
        `I couldn't find order ${orderId.data}.`,
        'Ask the customer to check the order number in their confirmation email. Do not guess a status.',
        'order_id',
      );
    }

    if (order.customerEmail.toLowerCase() !== email.data) {
      throw new ApiError(
        403,
        'ORDER_VERIFICATION_FAILED',
        "I couldn't verify that order with the email address provided.",
        'Do not reveal anything about this order. Ask the customer to check the email used at checkout. If it still fails, offer to connect them with the store team.',
        'email',
      );
    }

    return presentOrder(order);
  }
}

export function presentOrder(o: Order) {
  const totalCents = o.items.reduce((sum, i) => sum + i.unitPriceCents * i.quantity, 0);
  return {
    order_id: o.orderId,
    status: o.status,
    status_label: STATUS_LABEL[o.status],
    placed_at: o.placedAt,
    items: o.items.map((i) => ({ sku: i.sku, name: i.name, quantity: i.quantity })),
    total: money(totalCents, o.currency),
    shipping: {
      carrier: o.carrier,
      tracking_number: o.trackingNumber,
      shipped_at: o.shippedAt,
      estimated_delivery: o.estimatedDelivery,
      delivered_at: o.deliveredAt,
    },
    customer_summary: orderSummary(o),
  };
}

function orderSummary(o: Order): string {
  const id = o.orderId;
  const eta = o.estimatedDelivery ? humanDate(o.estimatedDelivery) : null;
  switch (o.status) {
    case 'processing':
      return `Order ${id} is being prepared and hasn't shipped yet.${eta ? ` Estimated delivery is ${eta}.` : ''}`;
    case 'on_hold':
      return `Order ${id} is on hold while our team reviews it. They will email you with next steps.`;
    case 'shipped':
      return `Order ${id} shipped with ${o.carrier} (tracking ${o.trackingNumber}).${eta ? ` Estimated delivery is ${eta}.` : ''}`;
    case 'out_for_delivery':
      return `Order ${id} is out for delivery with ${o.carrier} today.`;
    case 'delivered':
      return `Order ${id} was delivered on ${humanDate(o.deliveredAt!)}.`;
    case 'cancelled':
      return `Order ${id} was cancelled and won't be shipped.`;
    case 'refunded':
      return `Order ${id} has been refunded.`;
  }
}
