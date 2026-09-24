/**
 * WESTERN NUMERALS IN BOTH LANGUAGES, for text we did not write.
 *
 * AKALT renders 0–9 in English and in Arabic. Everything the app formats
 * itself already obeys that: the active locale is pinned to
 * `ar-EG-u-nu-latn`, so every `Intl` price, count and date comes out Latin
 * while grouping, currency placement and month names stay Egyptian.
 *
 * That leaves the text we DID NOT write. A merchant's catalogue says
 * «رز مصري ١ كجم», because that is how an Egyptian supermarket writes a pack
 * size, and a screen that puts it beside «2 عبوات · 62 ج.م» is speaking two
 * numeral systems in one row — the exact inconsistency the locale pin exists
 * to remove.
 *
 * THIS IS PRESENTATION ONLY. The stored string is never rewritten: the
 * catalogue, the CSV it was imported from and the database keep exactly what
 * the merchant published, because that is their record of their own product
 * and we are not its author. Normalisation happens at the moment of display
 * and nowhere else.
 *
 * WHAT IT TOUCHES: digits, and nothing else. Not a letter, not a brand's
 * spelling, not the wording, not word order, not spacing.
 */

/** Arabic-Indic, U+0660–U+0669 — Egyptian, Gulf, Levantine catalogues. */
const ARABIC_INDIC = 0x0660;
/** Extended Arabic-Indic, U+06F0–U+06F9 — Persian and Urdu catalogues. */
const EXTENDED_ARABIC_INDIC = 0x06f0;

const DIGIT_BLOCKS = [ARABIC_INDIC, EXTENDED_ARABIC_INDIC];

/**
 * The separators, converted ONLY between two digits.
 *
 * U+066B and U+066C have no use outside a number, but the guard is cheap and
 * the failure it prevents is silently editing punctuation in a product name.
 * «١٫٥ كجم» has to become «1.5 كجم»: converting the digits and leaving the
 * separator would produce «1٫5», which is neither system and reads as a typo.
 */
const SEPARATORS: Record<string, string> = {
  '٫': '.', // ARABIC DECIMAL SEPARATOR
  '٬': ',', // ARABIC THOUSANDS SEPARATOR
};

function westernDigit(character: string): string | null {
  const code = character.codePointAt(0);
  if (code === undefined) return null;

  for (const base of DIGIT_BLOCKS) {
    if (code >= base && code <= base + 9) return String(code - base);
  }
  return null;
}

/**
 * Renders any Eastern numerals in a string as 0–9.
 *
 * Idempotent, and a no-op for the overwhelming majority of strings, which is
 * why it is safe to call on every merchant-supplied label rather than on the
 * ones somebody remembered to route through it.
 */
export function toWesternNumerals(value: string): string {
  let out = '';

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index]!;
    const digit = westernDigit(character);

    if (digit !== null) {
      out += digit;
      continue;
    }

    const separator = SEPARATORS[character];
    if (separator !== undefined) {
      const before = value[index - 1];
      const after = value[index + 1];
      if (before && after && westernDigit(before) !== null && westernDigit(after) !== null) {
        out += separator;
        continue;
      }
    }

    out += character;
  }

  return out;
}

/** True when a string still carries an Eastern numeral. For tests and audits. */
export function hasEasternNumerals(value: string): boolean {
  for (const character of value) {
    if (westernDigit(character) !== null) return true;
  }
  return false;
}
