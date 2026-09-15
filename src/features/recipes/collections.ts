/**
 * Discover collections. `tag` is matched against `Recipe.tags`.
 *
 * ITS OWN MODULE, WITH NO IMPORTS, on purpose. `scripts/fetch-recipe-images.ts`
 * reads this list to decide which recipes are worth a photograph first, and
 * that script runs under Node's type-stripping loader — which cannot resolve
 * the `@/` alias or an extensionless relative import. Living in `fixtures.ts`
 * beside `withResolvedImage` made it unreachable from there, and the
 * alternative was a second copy of the tags in the script, drifting quietly
 * the first time somebody added a collection.
 */
export const COLLECTIONS = [
  { slug: 'quick', tag: 'quick', labelKey: 'discover.collectionQuick', emoji: '⚡' },
  { slug: 'under-100', tag: 'under-100', labelKey: 'discover.collectionUnder100', emoji: '💸' },
  {
    slug: 'high-protein',
    tag: 'high-protein',
    labelKey: 'discover.collectionHighProtein',
    emoji: '💪',
  },
  { slug: 'healthy', tag: 'healthy', labelKey: 'discover.collectionHealthy', emoji: '🥗' },
  { slug: 'egyptian', tag: 'egyptian', labelKey: 'discover.collectionEgyptian', emoji: '🇪🇬' },
  { slug: 'italian', tag: 'italian', labelKey: 'discover.collectionItalian', emoji: '🍝' },
  { slug: 'asian', tag: 'asian', labelKey: 'discover.collectionAsian', emoji: '🍜' },
  { slug: 'breakfast', tag: 'breakfast', labelKey: 'discover.collectionBreakfast', emoji: '🍳' },
  { slug: 'late-night', tag: 'late-night', labelKey: 'discover.collectionLateNight', emoji: '🌙' },
  { slug: 'air-fryer', tag: 'air-fryer', labelKey: 'discover.collectionAirFryer', emoji: '🔥' },
  { slug: 'beginner', tag: 'beginner', labelKey: 'discover.collectionBeginner', emoji: '🌱' },
  { slug: 'comfort', tag: 'comfort', labelKey: 'discover.collectionTrending', emoji: '🍲' },
] as const;

export type CollectionSlug = (typeof COLLECTIONS)[number]['slug'];
