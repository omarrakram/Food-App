import type { Recipe } from '@/types/domain';

import { withResolvedImage } from './images';
import { RECIPE_CATALOGUE } from './catalogue.generated';

/**
 * The curated recipe catalogue.
 *
 * The recipes themselves live in `data/recipes/*.json` and are compiled into
 * `catalogue.generated.ts` by `npm run recipes:import`, which validates every
 * ingredient reference, allergen declaration and diet tag before emitting.
 * This module exists to bind that data to runtime concerns — right now that
 * means resolving each image path to a URL for however this build is hosted.
 *
 * Bundling it serves three purposes:
 *   1. the app is fully usable before any backend exists,
 *   2. Discover has real content against a cold database, and
 *   3. `scripts/generate-seed.ts` compiles the same rows into `seed.sql`,
 *      which is what stops the bundle and the database drifting apart.
 */
export const RECIPE_FIXTURES: Recipe[] = RECIPE_CATALOGUE.map(withResolvedImage);

export const RECIPES_BY_ID = new Map(RECIPE_FIXTURES.map((recipe) => [recipe.id, recipe]));

export { COLLECTIONS, type CollectionSlug } from './collections';
