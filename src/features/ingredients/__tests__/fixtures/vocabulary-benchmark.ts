import type { FoodGroup } from './food-groups';

/**
 * What each probe term SHOULD return. A truth table, not a wish list.
 *
 * WHY THIS REPLACED A COUNT. The first version of this benchmark measured
 * whether the resolver returned *something*, and treated any resolution as a
 * success. That hid two whole classes of failure:
 *
 *   `whole chicken` resolves — to `chicken-breast`. A whole bird is not a
 *   breast, and the error is an ALIAS, so it is delivered with full
 *   confidence and no fuzzy tier involved.
 *
 *   `pita` resolves — to `baladi-bread`. Two different breads collapsed into
 *   one, silently, in a market where the difference is obvious.
 *
 * Both were counted as wins. A benchmark that cannot tell "returned" from
 * "returned the right thing" measures the wrong quantity.
 *
 * WHAT 254/254 MEANS, since Stage 2A reached it and the number invites the
 * wrong conclusion. This set was written FROM the catalogue's gaps: every term
 * in it was chosen because it probed something suspected of being missing or
 * wrong. Closing those gaps therefore exhausts the set, and the score stops
 * carrying information about anything except the gaps already known. It is a
 * ceiling effect, not a grade, and treating it as a launch signal would be the
 * same mistake as the count it replaced. Launch validation needs terms nobody
 * built the catalogue against — the independent holdout in §3b of
 * DATASET_EXPANSION_STRATEGY.md. What this set is still good for is
 * REGRESSION: it now fails on any wrong answer at all.
 *
 * WHEN A LABEL MAY CHANGE, because it is otherwise the one thing here that
 * must not move. `absent` is a statement about the CATALOGUE, not about the
 * search: it says "we do not have this concept". When an approved stage adds
 * the row, that statement stops being true and the label follows the data —
 * always from `absent` to `canonical`, which is strictly HARDER to satisfy,
 * because `absent` accepts any dead end while `canonical` demands one exact
 * slug. A label may never move the other way, and may never be relaxed to let
 * an implementation pass.
 */

export type Expectation =
  /** The catalogue has this exact concept; anything else is wrong. */
  | { readonly kind: 'canonical'; readonly slug: string }
  /**
   * The term is genuinely ambiguous in Egyptian usage and more than one answer
   * is defensible. `because` must say why — an `oneOf` written to make a
   * failing term pass is how a benchmark stops being a benchmark.
   */
  | { readonly kind: 'oneOf'; readonly slugs: readonly string[]; readonly because: string }
  /**
   * The catalogue genuinely lacks this concept. The ONLY acceptable outcomes
   * are a dead end, or a suggestion from the same food group. A confident
   * suggestion from another group is a safety violation.
   */
  | { readonly kind: 'absent'; readonly concept: string; readonly group: FoodGroup };

export type BenchmarkEntry = {
  /** Every spelling a user might type for one concept. */
  readonly terms: readonly string[];
  readonly expect: Expectation;
  readonly note?: string;
};

const canonical = (slug: string): Expectation => ({ kind: 'canonical', slug });
const oneOf = (slugs: readonly string[], because: string): Expectation => ({
  kind: 'oneOf',
  slugs,
  because,
});
const absent = (concept: string, group: FoodGroup): Expectation => ({
  kind: 'absent',
  concept,
  group,
});

/**
 * The development benchmark: 254 terms across 90 concepts.
 *
 * NOT a launch gate. These terms were used to author the catalogue's gaps, so
 * once Stage 1 writes aliases against them the score here becomes circular —
 * it will measure whether the aliases were written, which is already known.
 * See `DATASET_EXPANSION_STRATEGY.md` § holdout for the independent set that
 * does gate launch.
 */
export const BENCHMARK: readonly BenchmarkEntry[] = [
  // --- vegetables ---------------------------------------------------------
  { terms: ['molokhia', 'ملوخية'], expect: canonical('molokhia') },
  { terms: ['bamia', 'بامية', 'okra'], expect: canonical('okra') },
  { terms: ['koosa', 'كوسة', 'zucchini'], expect: canonical('zucchini') },
  { terms: ['betengan', 'باذنجان', 'aubergine', 'eggplant'], expect: canonical('eggplant') },
  { terms: ['torshi', 'طرشي', 'mekhalel', 'مخلل', 'pickles'], expect: canonical('pickles') },
  { terms: ['sabanekh', 'سبانخ', 'spinach'], expect: canonical('spinach') },
  { terms: ['gargeer', 'جرجير', 'rocket', 'arugula'], expect: canonical('rocket') },
  { terms: ['kromb', 'كرنب', 'cabbage'], expect: canonical('cabbage') },
  { terms: ['lift', 'لفت', 'turnip'], expect: canonical('turnip') },
  { terms: ['bassal akhdar', 'بصل أخضر'], expect: canonical('green-onion') },
  { terms: ['bataa', 'بطاطا', 'sweet potato'], expect: canonical('sweet-potato') },

  // --- fruit --------------------------------------------------------------
  { terms: ['balah', 'بلح', 'dates'], expect: canonical('dates') },
  { terms: ['teen', 'تين', 'figs'], expect: canonical('figs') },
  { terms: ['goafa', 'جوافة', 'guava'], expect: canonical('guava') },
  { terms: ['manga', 'مانجا', 'mango'], expect: canonical('mango') },
  { terms: ['farawla', 'فراولة', 'strawberry'], expect: canonical('strawberry') },
  { terms: ['shammam', 'شمام', 'cantaloupe'], expect: canonical('melon') },
  { terms: ['batteekh', 'بطيخ', 'watermelon'], expect: canonical('watermelon') },
  { terms: ['romman', 'رمان', 'pomegranate'], expect: canonical('pomegranate') },
  { terms: ['einab', 'عنب', 'grapes'], expect: canonical('grapes') },

  // --- herbs and spices ---------------------------------------------------
  {
    terms: ['kozbara', 'كزبرة', 'coriander'],
    expect: oneOf(
      ['coriander', 'coriander-ground'],
      'Egyptian usage covers the fresh herb and the ground seed with one word, and both are in the catalogue.',
    ),
  },
  { terms: ['shabat', 'شبت', 'dill'], expect: canonical('dill') },
  { terms: ['naanaa', 'نعناع', 'mint'], expect: canonical('mint') },
  { terms: ['baharat', 'بهارات', 'mixed spice'], expect: canonical('mixed-spice') },
  {
    terms: ['shatta', 'شطة', 'chili'],
    expect: oneOf(
      ['chili-pepper', 'chili-flakes', 'chili-powder', 'hot-sauce'],
      'In Egypt shatta is the fresh pepper, the dried flakes and the bottled sauce depending on the household.',
    ),
  },
  { terms: ['kamoun', 'كمون', 'cumin'], expect: canonical('cumin') },
  { terms: ['kerfa', 'قرفة', 'cinnamon'], expect: canonical('cinnamon') },
  { terms: ['habahan', 'هيل', 'cardamom'], expect: canonical('cardamom') },
  { terms: ['sumac', 'سماق'], expect: canonical('sumac') },
  {
    terms: ['zaatar', 'زعتر'],
    expect: oneOf(
      ['thyme-dried'],
      'The herb and the sesame-and-sumac blend share the word. The blend is a genuine catalogue gap; the herb is the defensible answer until it exists.',
    ),
    note: 'Ontology: the BLEND deserves its own row. Tracked as a P1 gap.',
  },
  { terms: ['dukkah', 'دقة'], expect: canonical('dukkah') },
  { terms: ['wara enab', 'ورق عنب', 'vine leaves'], expect: canonical('vine-leaves') },

  // --- meat, cuts and offal -----------------------------------------------
  { terms: ['kandooz', 'كندوز', 'veal'], expect: canonical('veal') },
  { terms: ['kebda', 'كبدة', 'liver'], expect: canonical('liver') },
  { terms: ['kawareh', 'كوارع', 'trotters'], expect: canonical('trotters') },
  {
    terms: ['mombar', 'ممبار'],
    expect: canonical('sausage-casing'),
    note: 'The INGREDIENT is the casing. Stuffed mombar is a dish and belongs in the recipe catalogue.',
  },
  { terms: ['lahma mafrooma', 'لحمة مفرومة', 'mince'], expect: canonical('ground-beef') },
  { terms: ['sogoq', 'سجق', 'sausage'], expect: canonical('sausage') },
  { terms: ['basterma', 'بسطرمة', 'pastrami'], expect: canonical('pastrami') },
  { terms: ['arnab', 'أرنب', 'rabbit'], expect: canonical('rabbit') },

  // --- poultry and its cuts -----------------------------------------------
  { terms: ['hamam', 'حمام', 'pigeon'], expect: canonical('pigeon') },
  { terms: ['batt', 'بط', 'duck'], expect: canonical('duck') },
  { terms: ['deek roumi', 'ديك رومي', 'turkey'], expect: canonical('turkey') },
  {
    terms: ['farkha', 'فرخة', 'whole chicken'],
    expect: canonical('whole-chicken'),
    note: 'Was resolving to chicken-breast by alias. Fixed in Stage 2A by the row AND by protecting a leading `whole` in the normaliser — an alias alone could not have done it.',
  },
  { terms: ['werk', 'ورك', 'thigh'], expect: canonical('chicken-thigh') },
  {
    terms: ['drumsticks', 'drumstick'],
    expect: absent('drumsticks', 'poultry'),
    note: 'STAGE 2B CONFLICT, recorded rather than resolved. `chicken-thigh` claims `drumsticks` as an alias. Defensible — أوراك is sold as the leg quarter, thigh and drumstick attached — but a drumstick is not a thigh, and the alias must be settled BEFORE any drumstick row exists or the two will fight over the word. Left failing on purpose so it cannot be forgotten.',
  },
  { terms: ['sedr', 'صدر', 'breast'], expect: canonical('chicken-breast') },
  { terms: ['kawanes', 'كوانس', 'gizzards'], expect: canonical('chicken-gizzards') },

  // --- fish and seafood ---------------------------------------------------
  { terms: ['feseekh', 'فسيخ'], expect: canonical('salted-fish') },
  { terms: ['renga', 'رنجة'], expect: canonical('herring') },
  { terms: ['bolti', 'بلطي', 'tilapia'], expect: canonical('tilapia') },
  { terms: ['boori', 'بوري', 'mullet'], expect: canonical('mullet') },
  { terms: ['gambari', 'جمبري', 'shrimp'], expect: canonical('shrimp') },
  { terms: ['kaboria', 'كابوريا', 'crab'], expect: canonical('crab') },
  { terms: ['sardine', 'سردين'], expect: canonical('sardines') },
  {
    terms: ['tona', 'تونة', 'tuna'],
    expect: oneOf(['tuna-can'], 'The catalogue only stocks the canned form, which is what Egyptian kitchens mean.'),
  },
  { terms: ['samak moosa', 'سمك موسى', 'sole'], expect: canonical('sole-fish') },

  // --- dairy and cheese ---------------------------------------------------
  { terms: ['gebna beida', 'جبنة بيضاء', 'white cheese'], expect: canonical('white-cheese') },
  { terms: ['gebna rumi', 'جبنة رومي', 'roumy'], expect: canonical('roumy-cheese') },
  { terms: ['talaga', 'طلاجة'], expect: canonical('talaga-cheese') },
  { terms: ['mesh', 'مش'], expect: canonical('mish-cheese') },
  { terms: ['areesh', 'قريش', 'cottage cheese'], expect: canonical('areesh-cheese') },
  { terms: ['labna', 'لبنة', 'labneh'], expect: canonical('labneh') },
  { terms: ['eshta', 'قشطة'], expect: canonical('clotted-cream') },
  { terms: ['cream'], expect: canonical('cream') },
  { terms: ['zabadi', 'زبادي', 'yogurt'], expect: canonical('yogurt') },

  // --- bread --------------------------------------------------------------
  { terms: ['eish baladi', 'عيش بلدي', 'baladi bread'], expect: canonical('baladi-bread') },
  {
    terms: ['eish shami', 'عيش شامي', 'pita'],
    expect: canonical('pita-bread'),
    note: 'CURRENTLY WRONG: `pita` and `eish shami` resolve to baladi-bread. Two different breads.',
  },
  { terms: ['feeno', 'فينو'], expect: canonical('baguette') },
  { terms: ['toast', 'توست'], expect: canonical('toast-bread') },

  // --- grains and pasta ---------------------------------------------------
  { terms: ['semolina', 'سميد', 'smeed'], expect: canonical('semolina') },
  { terms: ['freekeh', 'فريك'], expect: canonical('freekeh') },
  { terms: ['borghol', 'برغل', 'bulgur'], expect: canonical('bulgur') },
  { terms: ['shaareya', 'شعرية', 'vermicelli'], expect: canonical('vermicelli') },

  // --- legumes ------------------------------------------------------------
  { terms: ['fool akhdar', 'فول أخضر'], expect: canonical('green-fava-beans') },
  { terms: ['fool medames', 'فول مدمس', 'broad beans'], expect: canonical('fava-beans') },
  { terms: ['termis', 'ترمس', 'lupini'], expect: canonical('lupini-beans') },
  { terms: ['adas', 'عدس', 'lentils'], expect: canonical('lentils') },
  {
    terms: ['homos', 'حمص', 'chickpeas'],
    expect: oneOf(
      ['chickpeas', 'hummus-dip'],
      'The same word names the pulse and the dip. The catalogue holds both; either is defensible without more context.',
    ),
    note: 'INCONSISTENT TODAY: the Arabic resolves to the pulse, the transliteration to the dip.',
  },
  { terms: ['lobia', 'لوبيا', 'black eyed peas'], expect: canonical('black-eyed-peas') },

  // --- condiments and sweeteners ------------------------------------------
  { terms: ['tehina', 'طحينة', 'tahini'], expect: canonical('tahini') },
  {
    terms: ['dibs', 'دبس', 'assal aswad', 'عسل أسود', 'molasses'],
    expect: oneOf(
      ['molasses', 'date-syrup'],
      'Dibs is the generic syrup word; dibs el-balah is specifically date syrup. Both are in the catalogue.',
    ),
  },
  { terms: ['khal', 'خل', 'vinegar'], expect: canonical('vinegar') },
  { terms: ['maggi', 'ماجي', 'stock cube'], expect: canonical('stock-cube'), note: 'Brand as alias.' },
  { terms: ['ketchup', 'كاتشب'], expect: canonical('ketchup') },
  { terms: ['mayonnaise', 'مايونيز'], expect: canonical('mayonnaise') },

  // --- packaged and prepared ----------------------------------------------
  {
    terms: ['indomie', 'اندومي', 'noodles'],
    expect: canonical('noodles'),
    note: 'Genericised brand. Indomie means instant noodles in Egypt; the brand is an alias, never a row.',
  },
  { terms: ['corn flakes', 'كورن فليكس'], expect: canonical('corn-flakes') },
  { terms: ['halawa', 'حلاوة', 'halva'], expect: canonical('halva') },
  { terms: ['gelatin', 'جيلاتين'], expect: canonical('gelatin') },
  { terms: ['yeast', 'خميرة', 'khamira'], expect: canonical('yeast') },
];

/** Flattened, for the counts. */
export const BENCHMARK_TERMS: readonly { term: string; entry: BenchmarkEntry }[] = BENCHMARK.flatMap(
  (entry) => entry.terms.map((term) => ({ term, entry })),
);
