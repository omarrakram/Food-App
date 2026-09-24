import { toGrams, type PerPieceWeight } from '@/features/pricing/units';
import type { Unit } from '@/types/domain';

/**
 * How many packs does the cook actually have to buy?
 *
 * The recipe says 500 g of chicken breast. The merchant sells a 450 g pack and
 * a 1 kg pack. Neither is 500 g, and the answer — two of the small one, or one
 * of the large — is the difference between a basket that makes sense and one
 * that quietly short-changes somebody's dinner.
 *
 * Conversion is NOT reimplemented here. `features/pricing/units.ts` already
 * reduces everything to grams and already knows that a per-bunch weight says
 * nothing about a clove; a second conversion table would drift from the first
 * and the two would disagree about what a cup is.
 *
 * WHEN IT CANNOT TELL, IT SAYS SO. There is no branch that assumes one pack.
 * A `kind: 'unknown'` result means the UI asks the user, which is the correct
 * behaviour and the only honest one — guessing here spends real money.
 */

export type PackUnknownReason =
  /** The recipe does not quantify this ingredient ("salt, to taste"). */
  | 'no_recipe_quantity'
  /** The merchant has not told us how big the pack is. */
  | 'no_pack_size'
  /** Nothing converts these two units — a clove against a bunch. */
  | 'incompatible_units';

export type PackCalculation =
  | {
      readonly kind: 'known';
      readonly packs: number;
      /** What the cook ends up holding, in the pack's own unit. */
      readonly totalQuantity: number;
      readonly unit: Unit;
      /**
       * How much more than the recipe needs, in the pack's unit.
       *
       * Surfaced rather than hidden: "1 × 1 kg (you'll have 500 g left)" is a
       * useful sentence, and it is also the number a future "restock pantry"
       * feature needs.
       */
      readonly surplusQuantity: number;
    }
  | { readonly kind: 'unknown'; readonly reason: PackUnknownReason };

export type Measure = {
  readonly quantity: number | null;
  readonly unit: Unit | null;
};

/**
 * Floating point tolerance.
 *
 * `0.3 * 1000` is 300.00000000000006 in JavaScript, and 300.00000000000006 g
 * against a 100 g pack ceilings to FOUR packs instead of three. Not a
 * theoretical problem: recipes are written in kilograms and packs are sold in
 * grams, so this exact case occurs constantly.
 */
const EPSILON = 1e-9;

function ceilWithTolerance(value: number): number {
  const nearest = Math.round(value);
  if (Math.abs(value - nearest) < EPSILON) return nearest;
  return Math.ceil(value);
}

export function packsNeeded(
  required: Measure,
  pack: Measure,
  perPiece: PerPieceWeight | null = null,
): PackCalculation {
  if (required.quantity === null || required.unit === null) {
    return { kind: 'unknown', reason: 'no_recipe_quantity' };
  }
  if (pack.quantity === null || pack.unit === null || pack.quantity <= 0) {
    return { kind: 'unknown', reason: 'no_pack_size' };
  }

  // Same unit needs no conversion at all, and works for units that have no
  // gram equivalent — a 12-piece tray of eggs against "2 pieces".
  if (required.unit === pack.unit) {
    return build(required.quantity, pack.quantity, pack.unit);
  }

  const requiredGrams = toGrams(required.quantity, required.unit, perPiece);
  const packGrams = toGrams(pack.quantity, pack.unit, perPiece);

  if (requiredGrams === null || packGrams === null || packGrams <= 0) {
    return { kind: 'unknown', reason: 'incompatible_units' };
  }

  // Work in the PACK's unit so the answer is expressed in what the customer
  // is actually buying, not in grams they never see.
  const gramsPerPackUnit = packGrams / pack.quantity;
  const requiredInPackUnit = requiredGrams / gramsPerPackUnit;

  return build(requiredInPackUnit, pack.quantity, pack.unit);
}

function build(requiredInPackUnit: number, packSize: number, unit: Unit): PackCalculation {
  // "To taste" converts to zero grams, and zero packs of it is not a basket a
  // cook can cook from. If the ingredient is missing, one pack is the answer.
  const packs = Math.max(1, ceilWithTolerance(requiredInPackUnit / packSize));
  const totalQuantity = packs * packSize;
  const surplusRaw = totalQuantity - requiredInPackUnit;

  return {
    kind: 'known',
    packs,
    totalQuantity,
    unit,
    // Rounded to a thousandth so a float artefact never renders as
    // "0.0000000000001 g left over".
    surplusQuantity: Math.max(0, Math.round(surplusRaw * 1000) / 1000),
  };
}
