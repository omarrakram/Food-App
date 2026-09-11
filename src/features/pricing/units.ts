import type { Unit } from '@/types/domain';

/**
 * Unit conversion for costing and serving scaling.
 *
 * Everything is reduced to grams. For liquids we use the 1 ml ≈ 1 g
 * approximation: for supermarket costing the error (oil is ~0.92 g/ml) is well
 * inside the spread between the low and high price estimates, and it keeps the
 * conversion table to a single dimension.
 */

/** Grams per unit for units that do not depend on the ingredient. */
const ABSOLUTE_GRAMS: Partial<Record<Unit, number>> = {
  g: 1,
  kg: 1000,
  ml: 1,
  l: 1000,
  tbsp: 15,
  tsp: 5,
  cup: 240,
  pinch: 0.5,
  // "to taste" contributes no meaningful cost or quantity.
  to_taste: 0,
};

/** Units whose weight depends on the specific ingredient. */
const PER_PIECE_UNITS: ReadonlySet<Unit> = new Set<Unit>([
  'piece',
  'clove',
  'slice',
  'bunch',
  'can',
  'pack',
]);

export function isCountableUnit(unit: Unit): boolean {
  return PER_PIECE_UNITS.has(unit);
}

/**
 * How much one countable unit of a specific ingredient weighs — and, crucially,
 * *which* countable unit that is.
 *
 * The unit matters: 60 g is the weight of one BUNCH of parsley, and using it to
 * convert "1 clove" would silently produce a number that means nothing. Pairing
 * the weight with its unit makes an unconvertible request return null instead.
 */
export type PerPieceWeight = {
  unit: Unit;
  grams: number;
};

/**
 * Derives the per-piece weight for a catalogue entry.
 *
 * `gramsPerPiece` is quoted for whichever countable unit the ingredient is
 * naturally counted in: its `defaultUnit` when that is countable (slices of
 * bread, cloves of garlic), otherwise its `priceUnit` (yogurt is measured in
 * grams but sold by the pot). When neither is countable there is no per-piece
 * weight at all.
 */
export function perPieceWeightFor(
  entry: { defaultUnit: Unit; gramsPerPiece: number | null } | null | undefined,
  /**
   * Unit the price is quoted in, when one is known. Prices no longer live on
   * the catalogue entry, so the caller supplies it — a quote in `piece` still
   * needs a per-piece weight to convert against.
   */
  quotedUnit?: Unit | null,
): PerPieceWeight | null {
  if (!entry || entry.gramsPerPiece === null) return null;

  if (isCountableUnit(entry.defaultUnit)) {
    return { unit: entry.defaultUnit, grams: entry.gramsPerPiece };
  }
  if (quotedUnit && isCountableUnit(quotedUnit)) {
    return { unit: quotedUnit, grams: entry.gramsPerPiece };
  }
  return null;
}

/**
 * Converts a quantity to grams.
 *
 * Returns null when the conversion is not defined — a countable unit with no
 * matching per-piece weight. Callers must treat null as "cannot convert" and
 * fall back to a whole-unit price rather than inventing a weight.
 */
export function toGrams(
  quantity: number,
  unit: Unit,
  perPiece: PerPieceWeight | null,
): number | null {
  if (!Number.isFinite(quantity) || quantity < 0) return null;

  const absolute = ABSOLUTE_GRAMS[unit];
  if (absolute !== undefined) return quantity * absolute;

  if (PER_PIECE_UNITS.has(unit)) {
    // Only the ingredient's OWN countable unit converts. A per-bunch weight
    // says nothing about a clove.
    if (!perPiece || perPiece.unit !== unit) return null;
    return quantity * perPiece.grams;
  }

  return null;
}

/**
 * Scales a recipe quantity from `baseServings` to `targetServings`, rounding to
 * something a cook can actually measure.
 */
export function scaleQuantity(
  quantity: number | null,
  baseServings: number,
  targetServings: number,
): number | null {
  if (quantity === null || baseServings <= 0) return quantity;
  const scaled = (quantity * targetServings) / baseServings;
  return roundForKitchen(scaled);
}

/**
 * Kitchen-friendly rounding: whole numbers for countable amounts, halves for
 * small measures, tens for larger weights. Nobody weighs out 233g of rice.
 */
export function roundForKitchen(value: number): number {
  if (value <= 0) return 0;
  if (value < 1) return Math.round(value * 4) / 4;
  if (value < 10) return Math.round(value * 2) / 2;
  if (value < 100) return Math.round(value);
  return Math.round(value / 10) * 10;
}

/**
 * The fractions a recipe is written with.
 *
 * `roundForKitchen` already snaps to quarters and halves, so these are the only
 * fractional values that can reach here. A recipe says "½ bunch", never
 * "0.5 bunches" — the decimal reads like a measurement taken off a scale.
 */
const FRACTION_GLYPHS: Record<string, string> = {
  '0.25': '¼',
  '0.5': '½',
  '0.75': '¾',
};

/**
 * Formats a kitchen amount, preferring a fraction over a decimal.
 *
 * The whole part still goes through `formatNumber` so Arabic gets Arabic-Indic
 * digits; only the fractional remainder becomes a glyph, which reads correctly
 * in both scripts.
 */
export function formatKitchenNumber(
  value: number,
  formatNumber: (value: number) => string,
): string {
  if (Number.isInteger(value)) return formatNumber(value);

  const whole = Math.floor(value);
  const glyph = FRACTION_GLYPHS[(value - whole).toFixed(2).replace(/0$/, '')];
  if (!glyph) return formatNumber(value);

  return whole === 0 ? glyph : `${formatNumber(whole)}${glyph}`;
}

/** Renders a quantity + unit the way a recipe would write it. */
export function formatQuantity(
  quantity: number | null,
  unit: Unit | null,
  formatNumber: (value: number) => string,
): string {
  if (unit === 'to_taste') return 'to taste';
  if (quantity === null) return unit ? unitLabel(unit) : '';

  const rounded = roundForKitchen(quantity);
  const numeric = formatKitchenNumber(rounded, formatNumber);

  if (!unit || unit === 'piece') return numeric;
  // Anything below one takes the singular: "½ bunch", not "½ bunches".
  return `${numeric} ${unitLabel(unit, rounded < 1 ? 1 : rounded)}`;
}

export function unitLabel(unit: Unit, quantity = 1): string {
  const plural = quantity !== 1;
  switch (unit) {
    case 'g':
      return 'g';
    case 'kg':
      return 'kg';
    case 'ml':
      return 'ml';
    case 'l':
      return 'L';
    case 'piece':
      return '';
    case 'clove':
      return plural ? 'cloves' : 'clove';
    case 'slice':
      return plural ? 'slices' : 'slice';
    case 'bunch':
      return plural ? 'bunches' : 'bunch';
    case 'can':
      return plural ? 'cans' : 'can';
    case 'pack':
      return plural ? 'packs' : 'pack';
    case 'tbsp':
      return 'tbsp';
    case 'tsp':
      return 'tsp';
    case 'cup':
      return plural ? 'cups' : 'cup';
    case 'pinch':
      return plural ? 'pinches' : 'pinch';
    case 'to_taste':
      return 'to taste';
    default: {
      // Exhaustiveness guard: adding a Unit without a label fails the build.
      const exhaustive: never = unit;
      return exhaustive;
    }
  }
}
