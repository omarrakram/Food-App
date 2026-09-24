import type { Language } from '@/i18n';
import type { Merchant, MerchantLocation, MerchantProduct } from '@/types/commerce';

/**
 * The name to SHOW for a merchant, a branch or a product.
 *
 * DELIBERATELY REACT-FREE, and the layering test enforces it. These are rules
 * over plain values — take a row and a language, return a string — and the
 * merchant dashboard and the order-confirmation emails will need exactly the
 * same answer without a renderer in sight. Screens pass `language` from
 * `useI18n()`; there is no hook wrapper here because a one-line hook that only
 * closes over the language is not worth pinning React to this file for.
 *
 * A supermarket's Arabic name is its own trade name, not a translation we get
 * to produce, and where a merchant has not given us one we show the name they
 * did give rather than transliterating it ourselves. Getting a partner's own
 * name — or the name printed on a pack — wrong in their own language is not a
 * small error.
 */
export function merchantDisplayName(merchant: Merchant, language: Language): string {
  if (language !== 'ar') return merchant.name;
  return merchant.nameAr ?? merchant.name;
}

export function locationDisplayName(location: MerchantLocation, language: Language): string {
  if (language !== 'ar') return location.name;
  return location.nameAr ?? location.name;
}

export function productDisplayName(product: MerchantProduct, language: Language): string {
  if (language !== 'ar') return product.name;
  return product.nameAr ?? product.name;
}
