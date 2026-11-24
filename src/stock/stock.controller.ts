import { Controller, Get, Inject, Param } from '@nestjs/common';
import { z } from 'zod';
import { RequireScope } from '../auth/api-key.guard';
import { ApiError } from '../common/api-error';
import { humanDate, money } from '../common/format';
import { Product, STORE_REPOSITORY, StoreRepository } from '../store/store.types';

export const LOW_STOCK_THRESHOLD = 3;

/** Accepts "RDG-1001", "rdg-1001", " RDG 1001 " and "RDG1001"; anything else is rejected. */
const SkuParam = z
  .string()
  .transform((s) => s.trim().toUpperCase().replace(/\s+/g, '-').replace(/^([A-Z]{3})(\d{4})$/, '$1-$2'))
  .pipe(z.string().regex(/^[A-Z]{3}-\d{4}$/));

@Controller('v1/stock')
export class StockController {
  constructor(@Inject(STORE_REPOSITORY) private readonly repo: StoreRepository) {}

  @Get(':sku')
  @RequireScope('stock:read')
  async getStock(@Param('sku') rawSku: string) {
    const parsed = SkuParam.safeParse(rawSku);
    if (!parsed.success) {
      throw ApiError.invalidParameter(
        'sku',
        "That doesn't look like one of our product codes.",
        'Product codes look like RDG-1001. Find the product by name in the catalog and use its SKU; do not ask the customer for a code.',
      );
    }

    const product = await this.repo.findProductBySku(parsed.data);
    if (!product) {
      throw new ApiError(
        404,
        'PRODUCT_NOT_FOUND',
        "We don't carry a product with that code.",
        'Do not invent a product. Check the catalog for the right SKU, or tell the customer we do not stock it and suggest a similar item from the catalog.',
        'sku',
      );
    }
    return presentStock(product);
  }
}

export function presentStock(p: Product) {
  const availability =
    p.quantityAvailable === 0 ? 'out_of_stock' : p.quantityAvailable <= LOW_STOCK_THRESHOLD ? 'low_stock' : 'in_stock';
  const label = p.variant ? `${p.name} (${p.variant})` : p.name;

  let summary: string;
  if (availability === 'out_of_stock') {
    summary = p.restockDate
      ? `${label} is out of stock. We expect more on ${humanDate(p.restockDate)}.`
      : `${label} is out of stock, and no restock date is scheduled yet.`;
  } else if (availability === 'low_stock') {
    summary = `${label} is in stock, but only ${p.quantityAvailable} left.`;
  } else {
    summary = `${label} is in stock.`;
  }

  return {
    sku: p.sku,
    name: p.name,
    variant: p.variant,
    price: money(p.priceCents, p.currency),
    availability,
    quantity_available: p.quantityAvailable,
    restock_date: p.restockDate,
    customer_summary: summary,
  };
}
