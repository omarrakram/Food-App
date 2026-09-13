import { env } from '@/lib/config/env';
import type { Recipe, RecipeImageMeta } from '@/types/domain';

import { LOCAL_RECIPE_IMAGES, type LocalRecipeImage } from './image-assets.generated';

/**
 * Where a recipe photograph actually comes from at runtime.
 *
 * A recipe row stores a PATH (`curated/koshari.jpg`), never a URL. The path is
 * stable; where it is served from is not. Production serves it from Supabase
 * Storage; a preview build with no Supabase project serves it from whatever
 * `EXPO_PUBLIC_RECIPE_IMAGE_BASE_URL` points at; and with neither configured
 * there is no URL at all and `RecipeImage` draws its branded fallback.
 *
 * Keeping the join in one function is what makes the photography question
 * answerable later without touching a screen: point the base somewhere else
 * and every surface picks it up.
 */

/** Bucket that holds curated and approved community recipe photography. */
export const RECIPE_IMAGE_BUCKET = 'recipe-images';

/**
 * The photograph shipped inside the app for this recipe, if there is one.
 *
 * Bundled assets beat every remote source. They cannot 404, they need no
 * configuration, they work on a train, and they are ours — which is the whole
 * point of downloading them rather than hot-linking Wikimedia.
 *
 * Acquired by `npm run images:fetch` and indexed by `npm run images:index`.
 */
export function localRecipeImage(slug: string | null | undefined): LocalRecipeImage | null {
  if (!slug) return null;
  return LOCAL_RECIPE_IMAGES[slug] ?? null;
}

/**
 * Attribution the licence obliges us to display.
 *
 * Returned rather than rendered here so the caller decides placement, but it
 * must be shown wherever the photograph is the subject of the screen — the
 * recipe detail hero, not a 60px thumbnail in a list.
 */
export function imageAttribution(
  image: RecipeImageMeta | null,
  slug?: string | null,
): string | null {
  // A bundled photograph carries the licence it was acquired under, which is
  // the one that actually obliges us — the recipe row's metadata describes the
  // placeholder it replaced.
  const local = localRecipeImage(slug);
  if (local) return local.attribution;

  if (!image) return null;
  if (image.attribution) return image.attribution;
  if (image.creator && image.license !== 'CC0-1.0') {
    return `${image.creator} · ${image.license}`;
  }
  return null;
}

/**
 * Resolves a stored path to something `expo-image` can load.
 *
 * Returns null rather than a broken URL when nothing is configured. A null is
 * a designed state; a 404 is a grey box with a loading spinner that never
 * finishes.
 */
export function resolveRecipeImageUrl(image: RecipeImageMeta | null): string | null {
  if (!image?.path) return null;

  const explicitBase = env.recipeImageBaseUrl;
  if (explicitBase) return joinUrl(explicitBase, image.path);

  const supabaseUrl = env.supabaseUrl;
  if (supabaseUrl) {
    return joinUrl(`${supabaseUrl}/storage/v1/object/public/${RECIPE_IMAGE_BUCKET}`, image.path);
  }

  return null;
}

function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

/** Fills in `imageUrl` for a recipe loaded from the bundle or the database. */
export function withResolvedImage<T extends Pick<Recipe, 'image' | 'imageUrl'>>(recipe: T): T {
  const imageUrl = resolveRecipeImageUrl(recipe.image);
  return imageUrl === recipe.imageUrl ? recipe : { ...recipe, imageUrl };
}
