/**
 * No two ingredients may claim the same word.
 *
 * `import-ingredients.ts` has guarded this since a `whole rice` alias
 * normalised to `rice` and brown rice quietly took over every rice recipe's
 * price. But the guard read `[name, ...aliases]` — the ENGLISH name and the
 * aliases — so an Arabic CANONICAL name went through no check at all.
 *
 * What shipped: `frozen-fries` was named `بطاطس مجمدة`, which normalises to
 * `بطاطس` because `مجمدة` is a noise word. That is the Arabic name of
 * `potatoes`. So the ordinary Egyptian word for potato resolved to a bag of
 * frozen chips, in the shipped catalogue, for as long as both rows existed.
 *
 * The coverage audit had been calling the `potatoes` concept AMBIGUOUS for
 * exactly this reason the whole time. The number was right there and nobody
 * read the row — which is why this is a test rather than a line in a report.
 */
import { INGREDIENT_CATALOGUE } from '../catalogue';
import { resolveIngredient } from '../matching';
import { normaliseIngredientName } from '../normalise';

describe('one word, one ingredient', () => {
  it('gives no normalised term two owners', () => {
    const owners = new Map<string, Set<string>>();
    for (const entry of INGREDIENT_CATALOGUE) {
      for (const term of [entry.name, entry.nameAr, ...entry.aliases]) {
        const key = normaliseIngredientName(term);
        if (!key) continue;
        if (!owners.has(key)) owners.set(key, new Set());
        owners.get(key)!.add(entry.slug);
      }
    }

    const contested = [...owners.entries()]
      .filter(([, slugs]) => slugs.size > 1)
      .map(([key, slugs]) => `"${key}" claimed by ${[...slugs].sort().join(' and ')}`);

    expect(contested).toEqual([]);
  });

  it('checks Arabic names too, not only English ones', () => {
    // Non-vacuity: the catalogue must actually contain Arabic names for the
    // assertion above to have been doing anything.
    const withArabic = INGREDIENT_CATALOGUE.filter((entry) => /[؀-ۿ]/.test(entry.nameAr));
    expect(withArabic.length).toBeGreaterThan(300);
  });
});

describe('the everyday word reaches the everyday ingredient', () => {
  // Each of these is a word an Egyptian cook types without thinking. Pinned
  // by hand because a generic rule cannot say which of two plausible rows is
  // the one a person means.
  it.each([
    ['بطاطس', 'potatoes'],
    ['بطاطس مجمدة', 'potatoes'],
    ['بطاطس محمرة', 'frozen-fries'],
    ['دقيق', 'flour'],
    ['دقيق قمح', 'flour'],
    ['دقيق قمح كامل', 'whole-wheat-flour'],
    ['whole wheat flour', 'whole-wheat-flour'],
    ['ردة', 'wheat-bran'],
    ['wheat bran', 'wheat-bran'],
  ])('%s resolves to %s', (term, slug) => {
    expect(resolveIngredient(term)?.slug).toBe(slug);
  });
});
