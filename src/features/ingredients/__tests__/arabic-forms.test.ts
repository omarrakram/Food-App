import { resolveIngredient } from '../matching';
// ---------------------------------------------------------------------------
// Arabic preparation words.
//
// The noise list was entirely English in an app whose primary audience types
// Arabic, so `frozen okra` reached okra and `بامية مجمدة` reached nothing. The
// coverage census measured the cost: input coverage 48.8% against 71.3%
// ontology coverage.
//
// Both halves are asserted, and the second half is the important one. Arabic
// modifiers TRAIL the noun, while `PROTECTED_PREFIXES` only guards position
// zero — so there is no symmetric guard, and a word that carries identity must
// be left out of the list entirely rather than protected back in.
// ---------------------------------------------------------------------------
describe('Arabic form words are stripped, identity-bearing ones are not', () => {
  it('reaches the base ingredient from the Arabic form', () => {
    const cases: readonly [string, string][] = [
      ['بامية مجمدة', 'okra'],
      ['ملوخية مجمدة', 'molokhia'],
      ['سبانخ مجمدة', 'spinach'],
      ['خرشوف مجمد', 'artichoke'],
      ['فول معلب', 'fava-beans'],
      ['حمص معلب', 'chickpeas'],
      ['مشروم معلب', 'mushroom'],
      ['زنجبيل طازج', 'ginger'],
      ['جمبري مقشر', 'shrimp'],
      ['رنجة مدخنة', 'herring'],
      ['بيض مسلوق', 'eggs'],
      ['ذرة مشوية', 'corn'],
    ];
    for (const [term, slug] of cases) {
      expect({ term, slug: resolveIngredient(term)?.slug ?? null }).toEqual({ term, slug });
    }
  });

  it('never strips a word that names a different ingredient', () => {
    // Each of these would collapse onto a NEIGHBOURING row if its modifier
    // were treated as noise, which is why none of them is in the list.
    const cases: readonly [string, string][] = [
      ['لحمة مفرومة', 'ground-beef'], // not `lahma`
      ['كزبرة ناشفة', 'coriander-ground'], // the seed, not the herb
      ['عيش بلدي', 'baladi-bread'], // بلدي is the bread's own name
      ['صوص طماطم مطبوخ', 'tomato-sauce'], // stripping مطبوخ re-owns the ambiguous phrase
    ];
    for (const [term, slug] of cases) {
      expect({ term, slug: resolveIngredient(term)?.slug ?? null }).toEqual({ term, slug });
    }

    // And the phrase those words protect stays unowned.
    expect(resolveIngredient('صوص طماطم')).toBeNull();
    expect(resolveIngredient('كزبرة')?.slug).toBe('coriander');
  });
});
