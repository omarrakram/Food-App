import type { PerPieceWeight } from '@/features/pricing/units';
import {
  MAPPING_CONFIRM_THRESHOLD,
  type IngredientProductMapping,
  type MappingSource,
  type MerchantProduct,
} from '@/types/commerce';
import type { Allergen, Availability } from '@/types/domain';

import { packsNeeded } from './pack-maths';
import type {
  CandidateExclusion,
  CandidateReason,
  ProductCandidate,
  SourcedLine,
  SourcingLine,
  SourcingRequest,
  SourcingResult,
  SourcingStatus,
} from './ports';

/**
 * Which product to buy for a missing ingredient.
 *
 * NO MODEL DECIDES THIS. Not because a model could not guess well, but because
 * a wrong SKU is a trust failure of a different order from a wrong recipe
 * suggestion: it is somebody's money, spent on the wrong thing, delivered to
 * their door. The ranking below is integer arithmetic over observable facts,
 * it explains itself through `reasons`, and it produces the same answer twice.
 *
 * THREE INDEPENDENT QUESTIONS, ANSWERED IN ORDER:
 *
 *   1. MAPPING CORRECTNESS   Does this SKU represent this ingredient?
 *   2. USER ELIGIBILITY      May THIS user receive it?
 *   3. PURCHASABILITY        Can anyone buy it right now?
 *
 * A verified or manual mapping is an assertion about (1) ALONE. A human
 * confirming that Brand X Milk 1L is milk has said nothing about whether this
 * particular cook can drink it, and nothing about whether the shop has any.
 * Verification therefore overrides the confidence bar and nothing else — if it
 * could override (2), a hand-checked mapping would be a route to handing
 * somebody an allergen, which is the worst failure available to this layer.
 *
 * Only once all three are satisfied does anything get scored, so no
 * combination of price, stock and pack fit can float an ineligible product to
 * the top.
 */

// --- Weights ---------------------------------------------------------------
// Integers, and spaced so a lower tier cannot out-score a higher one by
// accumulating small advantages. A cheap, perfectly-sized, in-stock guess must
// still lose to a mapping a person checked.

const VERIFIED_SCORE = 1_000;

const SOURCE_SCORES: Record<MappingSource, number> = {
  manual: 400,
  sku_exact: 300,
  name_match: 150,
  category_fallback: 0,
};

const AVAILABILITY_SCORES: Record<Availability, number> = {
  in_stock: 200,
  low_stock: 100,
  unknown: 25,
  out_of_stock: 0,
};

/** Confidence refines the order WITHIN a source tier; it never crosses one. */
const CONFIDENCE_WEIGHT = 50;
const PACK_FIT_WEIGHT = 150;
const PRICE_WEIGHT = 100;

const AVAILABILITY_REASONS: Record<Availability, CandidateReason> = {
  in_stock: 'in_stock',
  low_stock: 'low_stock',
  unknown: 'stock_unknown',
  out_of_stock: 'out_of_stock',
};

const SOURCE_REASONS: Record<MappingSource, CandidateReason> = {
  manual: 'manual_mapping',
  sku_exact: 'exact_sku_mapping',
  name_match: 'name_match_mapping',
  category_fallback: 'category_fallback_mapping',
};

export type SourcingCandidateInput = {
  readonly product: MerchantProduct;
  readonly mapping: IngredientProductMapping;
  /**
   * Allergens this PRODUCT carries, which may exceed the canonical
   * ingredient's own. A canonical `chicken-breast` has no dairy in it; a
   * merchant's marinated chicken breast might.
   *
   * NULL MEANS THE MERCHANT HAS NOT PUBLISHED THIS, and null is not the same
   * as `[]`. An empty array is the merchant saying "none"; null is nobody
   * having said anything. Treating the two alike would mean that the moment we
   * integrate a catalogue without allergen data, every product silently
   * becomes safe for everybody — which is how this goes wrong quietly, at
   * scale, for exactly the users who can least afford it.
   *
   * A null on a user with allergies makes the candidate uncertain rather than
   * excluded: it can be offered, it cannot be chosen for them.
   */
  readonly productAllergens: readonly Allergen[] | null;
};

export type SourcingContext = {
  /** Hard exclusions. Never a ranking weight. */
  readonly avoidAllergens: readonly Allergen[];
  /** Per-piece weight for a canonical ingredient, for the pack arithmetic. */
  readonly perPieceFor: (ingredientSlug: string) => PerPieceWeight | null;
};

// --- The three gates -------------------------------------------------------

/** (1) Mapping correctness. A human's refusal, kept so it cannot be re-derived. */
function mappingExcluded(input: SourcingCandidateInput): boolean {
  return input.mapping.isBlocked;
}

/** (3) Purchasability, structural half. Delisted is not "out of stock". */
function purchasabilityExcluded(input: SourcingCandidateInput): boolean {
  return !input.product.isActive;
}

export type EligibilityVerdict = 'eligible' | 'ineligible' | 'unknown';

/**
 * (2) User eligibility. Never overridden by a manual or verified mapping.
 *
 * Returns `unknown` — not `eligible` — when the user has restrictions and the
 * merchant has published no allergen data. The distinction is the whole point.
 */
export function eligibilityOf(
  input: SourcingCandidateInput,
  context: SourcingContext,
): EligibilityVerdict {
  if (context.avoidAllergens.length === 0) return 'eligible';
  if (input.productAllergens === null) return 'unknown';

  const clashes = input.productAllergens.some((allergen) =>
    context.avoidAllergens.includes(allergen),
  );
  return clashes ? 'ineligible' : 'eligible';
}

// --- Scoring ---------------------------------------------------------------

function scoreCandidate(
  input: SourcingCandidateInput,
  eligibility: EligibilityVerdict,
  surplusRatio: number | null,
  isSmallestOverbuy: boolean,
  priceRank: number,
  hasRestrictions: boolean,
): { score: number; reasons: CandidateReason[] } {
  const reasons: CandidateReason[] = [];
  let score = 0;

  if (input.mapping.isVerified) {
    score += VERIFIED_SCORE;
    reasons.push('verified_mapping');
  }

  score += SOURCE_SCORES[input.mapping.source];
  reasons.push(SOURCE_REASONS[input.mapping.source]);

  score += Math.round(clamp01(input.mapping.confidence) * CONFIDENCE_WEIGHT);

  score += AVAILABILITY_SCORES[input.product.availability];
  reasons.push(AVAILABILITY_REASONS[input.product.availability]);

  // Only worth saying when the user actually has restrictions; otherwise it is
  // noise on every line.
  if (hasRestrictions) {
    reasons.push(eligibility === 'unknown' ? 'eligibility_unknown' : 'dietary_eligible');
  }

  if (surplusRatio === null) {
    reasons.push('pack_size_unknown');
  } else {
    score += Math.round(PACK_FIT_WEIGHT * (1 - clamp01(surplusRatio)));
    if (surplusRatio === 0) reasons.push('exact_quantity_fit');
    else reasons.push(isSmallestOverbuy ? 'smallest_overbuy' : 'overbuy');
  }

  score += Math.round(PRICE_WEIGHT * clamp01(priceRank));
  if (priceRank === 1) reasons.push('lowest_effective_cost');

  return { score, reasons };
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

// --- The engine ------------------------------------------------------------

export function sourceLine(
  line: SourcingLine,
  inputs: readonly SourcingCandidateInput[],
  context: SourcingContext,
): SourcedLine {
  const exclusions: CandidateExclusion[] = [];
  const usable: { input: SourcingCandidateInput; eligibility: EligibilityVerdict }[] = [];

  for (const input of inputs) {
    if (mappingExcluded(input)) {
      exclusions.push({ productId: input.product.id, axis: 'mapping', reason: 'blocked' });
      continue;
    }
    if (purchasabilityExcluded(input)) {
      exclusions.push({
        productId: input.product.id,
        axis: 'purchasability',
        reason: 'delisted',
      });
      continue;
    }

    const eligibility = eligibilityOf(input, context);
    if (eligibility === 'ineligible') {
      exclusions.push({ productId: input.product.id, axis: 'eligibility', reason: 'allergen' });
      continue;
    }

    usable.push({ input, eligibility });
  }

  if (usable.length === 0) {
    return {
      requested: line,
      status: emptyStatus(exclusions),
      candidates: [],
      chosen: null,
      exclusions,
    };
  }

  const perPiece = context.perPieceFor(line.ingredientSlug);

  // Pass one: pack arithmetic, and what each option actually costs.
  const measured = usable.map((entry) => {
    const calculation = packsNeeded(
      { quantity: line.quantity, unit: line.unit },
      { quantity: entry.input.product.packQuantity, unit: entry.input.product.packUnit },
      perPiece,
    );

    const packs = calculation.kind === 'known' ? calculation.packs : null;
    const surplusRatio =
      calculation.kind === 'known' && calculation.totalQuantity > 0
        ? calculation.surplusQuantity / calculation.totalQuantity
        : null;
    const effectiveCostMinor =
      packs === null ? null : packs * entry.input.product.price.amountMinor;

    return { ...entry, packs, surplusRatio, effectiveCostMinor };
  });

  // Pass two: price and overbuy are RELATIVE, so they can only be scored once
  // every option is measured. Comparing shelf prices instead of effective cost
  // is the classic supermarket-app error — two 450 g packs at 50 are dearer
  // than one 1 kg pack at 90, and the shelf price says the opposite.
  const costs = measured
    .map((entry) => entry.effectiveCostMinor)
    .filter((cost): cost is number => cost !== null);
  const cheapest = costs.length > 0 ? Math.min(...costs) : null;
  const dearest = costs.length > 0 ? Math.max(...costs) : null;

  const overbuys = measured
    .map((entry) => entry.surplusRatio)
    .filter((ratio): ratio is number => ratio !== null && ratio > 0);
  const leastOverbuy = overbuys.length > 0 ? Math.min(...overbuys) : null;

  const hasRestrictions = context.avoidAllergens.length > 0;

  const candidates: ProductCandidate[] = measured.map((entry) => {
    const { score, reasons } = scoreCandidate(
      entry.input,
      entry.eligibility,
      entry.surplusRatio,
      entry.surplusRatio !== null && entry.surplusRatio === leastOverbuy,
      priceRankOf(entry.effectiveCostMinor, cheapest, dearest),
      hasRestrictions,
    );

    return {
      product: entry.input.product,
      mapping: entry.input.mapping,
      packsNeeded: entry.packs,
      effectiveCostMinor: entry.effectiveCostMinor,
      score,
      reasons,
    };
  });

  candidates.sort(compareCandidates);

  // PURCHASABILITY IS NOT MAPPING STRENGTH. The best-mapped product in the
  // catalogue is still not something anybody can put in a bag today, so the
  // choice is made from what is actually buyable — and if nothing is, we say
  // so rather than quietly selecting a product the merchant cannot supply.
  const buyable = candidates.filter(
    (candidate) => candidate.product.availability !== 'out_of_stock',
  );
  const best = buyable[0];

  if (!best) {
    return {
      requested: line,
      status: 'no_purchasable_match',
      candidates,
      chosen: null,
      exclusions,
    };
  }

  const eligibilityOfBest =
    measured.find((entry) => entry.input.product.id === best.product.id)?.eligibility ??
    'unknown';

  const status = statusFor(best, eligibilityOfBest);
  return {
    requested: line,
    status,
    candidates,
    chosen: status === 'matched' ? best : null,
    exclusions,
  };
}

/** Nothing survived the gates. WHICH gate removed everything is the message. */
function emptyStatus(exclusions: readonly CandidateExclusion[]): SourcingStatus {
  if (exclusions.some((entry) => entry.axis === 'eligibility')) return 'no_eligible_match';
  if (exclusions.some((entry) => entry.axis === 'purchasability')) {
    return 'no_purchasable_match';
  }
  return 'unmapped';
}

function statusFor(
  best: ProductCandidate,
  eligibility: EligibilityVerdict,
): SourcingStatus {
  // Eligibility we cannot establish is never resolved in the user's absence.
  // Offering the option and asking is the only honest move; choosing it for
  // them would be the app deciding what somebody with an allergy may eat on
  // the strength of data nobody supplied.
  if (eligibility === 'unknown') return 'needs_confirmation';

  const trusted =
    best.mapping.isVerified ||
    // A MANUAL MAPPING IS A HUMAN DECISION, and `confidence` is a MATCHER
    // score — asking a hand-pinned product to clear the matcher's bar is a
    // category error, since nothing computed that number for a row somebody
    // created by choosing the product themselves.
    //
    // Note what this does NOT override: the gates above. It settles mapping
    // correctness only.
    best.mapping.source === 'manual' ||
    best.mapping.confidence >= MAPPING_CONFIRM_THRESHOLD;

  return trusted ? 'matched' : 'needs_confirmation';
}

/** 1 for the cheapest, 0 for the dearest, linear between. */
function priceRankOf(
  cost: number | null,
  cheapest: number | null,
  dearest: number | null,
): number {
  if (cost === null || cheapest === null || dearest === null) return 0;
  // Every option costs the same — or there is only one — so price cannot
  // separate them and must not silently penalise the sole candidate.
  if (dearest === cheapest) return 1;
  return (dearest - cost) / (dearest - cheapest);
}

/**
 * Total ordering.
 *
 * The final tie-break on product id looks arbitrary and is the most important
 * line in the function: without it, two equally-scored products come back in
 * whatever order the database happened to return, the list reshuffles on
 * refresh, and the test suite passes on Tuesday and fails on Wednesday.
 */
function compareCandidates(a: ProductCandidate, b: ProductCandidate): number {
  if (a.score !== b.score) return b.score - a.score;

  const costA = a.effectiveCostMinor ?? Number.MAX_SAFE_INTEGER;
  const costB = b.effectiveCostMinor ?? Number.MAX_SAFE_INTEGER;
  if (costA !== costB) return costA - costB;

  const packsA = a.packsNeeded ?? Number.MAX_SAFE_INTEGER;
  const packsB = b.packsNeeded ?? Number.MAX_SAFE_INTEGER;
  if (packsA !== packsB) return packsA - packsB;

  return a.product.id.localeCompare(b.product.id);
}

/** Sources a whole basket of missing ingredients against one merchant. */
export function sourceRequest(
  request: SourcingRequest,
  candidatesFor: (ingredientSlug: string) => readonly SourcingCandidateInput[],
  context: SourcingContext,
): SourcingResult {
  const lines = request.lines.map((line) =>
    sourceLine(line, candidatesFor(line.ingredientSlug), context),
  );

  return {
    merchantId: request.merchantId,
    locationId: request.locationId,
    lines,
    // Anything the cook has to look at before checkout can proceed.
    unresolvedCount: lines.filter((line) => line.status !== 'matched').length,
  };
}
