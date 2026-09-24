import { multiplyMoney, sumMoney } from '@/lib/format/money';
import type { Cart, CartLine, MerchantProduct } from '@/types/commerce';
import type { Money } from '@/types/domain';

import { cartSubtotalMinor } from './cart-repository';
import type { SelectedMerchant } from './merchant-selection';

/**
 * The cart, as the screen needs it: joined to the catalogue and totalled.
 *
 * Pure, and React-free, because every rule in here is one somebody could
 * argue about with money in their hand — what the basket costs, whether it
 * clears the branch's minimum, whether a price moved since it was added. Those
 * belong somewhere a test can drive them directly rather than inside a
 * `useMemo` behind three providers.
 */

/**
 * One cart line, joined to the catalogue row it points at.
 *
 * `product` is null when the branch no longer lists that id. That is not an
 * error state for the whole cart — one delisted item should not hide the other
 * five — so the line renders with what the cart itself knows and says the rest
 * is unknown.
 */
export type CartLineView = {
  readonly line: CartLine;
  readonly product: MerchantProduct | null;
  /** Snapshot unit price × quantity. What the cart currently says it costs. */
  readonly lineTotal: Money;
  /** The shelf price now, when the catalogue could be read. */
  readonly currentUnitPrice: Money | null;
  readonly priceChanged: boolean;
};

export type CartView = {
  readonly cart: Cart;
  readonly merchant: SelectedMerchant;
  readonly lines: readonly CartLineView[];
  readonly subtotal: Money;
  readonly deliveryFee: Money | null;
  readonly total: Money;
  /**
   * How far below the branch's minimum order this basket is, or null when
   * there is no floor or the basket clears it.
   */
  readonly shortfall: Money | null;
  readonly itemCount: number;
  readonly isDemo: boolean;
};

/**
 * TOTALS COME FROM THE SNAPSHOT PRICES, not from the catalogue read.
 *
 * The snapshot is what the user was shown when they added the line, and
 * silently re-totalling a basket underneath somebody is how a shop loses an
 * argument about what they agreed to pay. A changed price is SURFACED per
 * line instead; reconciling it belongs to checkout, where `revalidateCart`
 * re-totals from the current shelf and the customer has to look at the new
 * number before a draft can be built.
 *
 * `products` may be empty — the catalogue read can fail or still be in
 * flight — and the cart is fully renderable without it. Nothing here depends
 * on a product being found except the price comparison, which simply has
 * nothing to say when the shelf could not be read.
 */
export function buildCartView(
  cart: Cart,
  merchant: SelectedMerchant,
  products: ReadonlyMap<string, MerchantProduct>,
): CartView {
  const lines: CartLineView[] = cart.lines.map((line) => {
    const product = products.get(line.merchantProductId) ?? null;
    const currentUnitPrice = product?.price ?? null;

    return {
      line,
      product,
      lineTotal: multiplyMoney(line.unitPriceSnapshot, line.quantity),
      currentUnitPrice,
      priceChanged:
        currentUnitPrice !== null &&
        currentUnitPrice.amountMinor !== line.unitPriceSnapshot.amountMinor,
    };
  });

  const subtotal: Money = { amountMinor: cartSubtotalMinor(cart), currency: cart.currency };
  const deliveryFee = merchant.location.deliveryFee;
  const total = deliveryFee ? sumMoney([subtotal, deliveryFee], cart.currency) : subtotal;

  const minimum = merchant.location.minimumOrder;
  // The floor applies to the GOODS, not to the goods plus the fee: a
  // merchant's minimum is about whether the basket is worth picking, and
  // counting their own delivery charge towards it would let a cart clear the
  // floor on nothing but the fee.
  const shortfall =
    minimum && minimum.amountMinor > subtotal.amountMinor
      ? { amountMinor: minimum.amountMinor - subtotal.amountMinor, currency: cart.currency }
      : null;

  return {
    cart,
    merchant,
    lines,
    subtotal,
    deliveryFee,
    total,
    shortfall,
    itemCount: cart.lines.reduce((sum, line) => sum + line.quantity, 0),
    isDemo: merchant.isDemo,
  };
}
