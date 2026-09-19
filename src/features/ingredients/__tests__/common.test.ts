import { COMMON_INGREDIENT_NAMES } from '@/features/ingredients/common';
import { INGREDIENT_CATALOGUE, UNIVERSAL_BASICS } from '@/features/ingredients/catalogue';

/**
 * The quick-add list has to be useful on sight.
 *
 * It was previously the first eighteen `isCommonStaple` rows, and because the
 * catalogue is authored alphabetically that meant anise, baking powder, bay
 * leaf and caraway. These tests pin the property that actually matters —
 * the list leads with what recipes really use — rather than a fixed sequence
 * that would have to be edited every time a recipe is added.
 */
describe('common ingredients', () => {
  it('is ranked by real recipe usage, not by catalogue order', () => {
    const top = COMMON_INGREDIENT_NAMES.slice(0, 12);
    // Alphabetical order would put these first. Usage order must not.
    expect(top).not.toContain('anise');
    expect(top).not.toContain('bay leaf');
    expect(top).not.toContain('caraway');
  });

  it('leads with ingredients an Egyptian kitchen actually cooks with', () => {
    const top = COMMON_INGREDIENT_NAMES.slice(0, 12).join(' ');
    // Not an exhaustive list — just proof the ranking reaches real food.
    const staples = ['onion', 'tomato', 'garlic', 'oil', 'rice', 'egg'];
    const hits = staples.filter((name) => top.includes(name));
    expect({ top, hits }).toMatchObject({ top: expect.any(String) });
    expect(hits.length).toBeGreaterThanOrEqual(3);
  });

  it('never offers a universal basic, which the engine already assumes', () => {
    const bySlug = new Map(INGREDIENT_CATALOGUE.map((i) => [i.name, i.slug]));
    for (const name of COMMON_INGREDIENT_NAMES) {
      const slug = bySlug.get(name);
      if (slug) expect(UNIVERSAL_BASICS.has(slug)).toBe(false);
    }
  });

  it('only ever names ingredients the catalogue can match', () => {
    const names = new Set(INGREDIENT_CATALOGUE.map((i) => i.name));
    for (const name of COMMON_INGREDIENT_NAMES) expect(names.has(name)).toBe(true);
  });
});
