import { toWesternNumerals } from '@/lib/format/numerals';
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
 * TWO RULES, and they pull in opposite directions.
 *
 * 1. A supermarket's Arabic name is its own trade name, not a translation we
 *    get to produce, and where a merchant has not given us one we show the
 *    name they did give rather than transliterating it ourselves. Getting a
 *    partner's own name — or the name printed on a pack — wrong in their own
 *    language is not a small error.
 *
 * 2. AKALT renders 0–9 in both languages, so «رز مصري ١ كجم» sitting beside
 *    «2 عبوات · 62 ج.م» is the app speaking two numeral systems in one row.
 *
 * The two are reconciled by normalising NUMERALS ONLY, at display time. The
 * merchant's stored string is never rewritten — the catalogue and the CSV it
 * came from keep exactly what was published — and no letter, brand spelling or
 * word of their product wording is touched. This is the ONLY place merchant
 * text becomes user-visible text, which is what makes that guarantee hold.
 */

export function merchantDisplayName(merchant: Merchant, language: Language): string {
  const stored = language === 'ar' ? (merchant.nameAr ?? merchant.name) : merchant.name;
  return toWesternNumerals(stored);
}

export function locationDisplayName(location: MerchantLocation, language: Language): string {
  const stored = language === 'ar' ? (location.nameAr ?? location.name) : location.name;
  return toWesternNumerals(stored);
}

export function productDisplayName(product: MerchantProduct, language: Language): string {
  const stored = language === 'ar' ? (product.nameAr ?? product.name) : product.name;
  return toWesternNumerals(stored);
}

/**
 * A merchant's brand, as shown.
 *
 * Not rendered anywhere yet. It exists so the next screen that wants it takes
 * the normalised form by default rather than reading `product.brand` directly
 * and quietly reintroducing the inconsistency.
 */
export function brandDisplayName(product: MerchantProduct): string | null {
  return product.brand === null ? null : toWesternNumerals(product.brand);
}
