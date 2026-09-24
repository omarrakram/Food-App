import { useCallback } from 'react';

import { useI18n, type Language } from '@/i18n';
import { toWesternNumerals } from '@/lib/format/numerals';
import type { Recipe, RecipeStep } from '@/types/domain';

/**
 * Reading a recipe in the language the app is set to.
 *
 * A recipe is content, not UI copy, so it cannot live in the translation
 * dictionary: `t()` keys are fixed at build time and recipes arrive from a
 * database. Curated recipes therefore carry their own Arabic fields, and this
 * module is the single place that chooses between them.
 *
 * Everything falls back to English rather than to a raw key or a blank, which
 * matters for AI-generated recipes: the model answers in one language, and
 * machine-translating a cooking step — where "simmer" and "boil" are different
 * instructions, and a safety note is a safety note — is not something to do
 * silently behind the user's back.
 */

/**
 * How a recipe writes a preparation: "finely chopped", "to serve".
 *
 * Shared rather than stored per ingredient line because it is shared
 * vocabulary — 108 ingredient rows across the catalogue use 29 distinct
 * phrases, and writing each one out 108 times would guarantee they drifted
 * apart. `npm test` fails if a fixture uses a phrase that is missing here.
 */
const PREPARATION_AR: Record<string, string> = {
  'sliced into rings': 'مقطّع حلقات',
  wedged: 'مقطّع أرباع',
  'scrubbed and debearded': 'متغسّل ومتنضّف',
  cleaned: 'متنضّف',
  pitted: 'منزوع النوى',
  'drained and rinsed': 'مصفّى ومغسول',
  rinsed: 'مغسول',
  'peeled, ideally spotty': 'مقشّر، ويفضّل يكون مبقّع',
  'slaked in a little cold milk': 'مذوّب في شوية لبن بارد',
  'half mashed, half sliced': 'نصه مهروس ونصه شرايح',
  'small elbows': 'كوع صغير',
  'thinly sliced': 'شرايح رفيعة',
  crushed: 'مهروس',
  'for frying': 'للقلي',
  cooked: 'مطبوخ',
  chopped: 'مقطّع',
  diced: 'مكعبات',
  sliced: 'شرايح',
  crumbled: 'مفتّت',
  'to serve': 'للتقديم',
  'cut into strips': 'مقطّع شرايح طولية',
  minced: 'مفروم',
  grated: 'مبشور',
  juiced: 'معصور',
  'frozen, chopped': 'مجمّد ومقطّع',
  halved: 'مقسوم نصين',
  'wedges to serve': 'فصوص للتقديم',
  drained: 'مصفّى',
  'sliced thin': 'شرايح رفيعة',
  softened: 'طري',
  'one grated, one sliced': 'واحدة مبشورة وواحدة شرايح',
  'finely chopped': 'مفروم ناعم',
  'thickly sliced': 'شرايح تخينة',
  blended: 'مضروب في الخلاط',
  'cooked and cooled': 'مطبوخ ومبرّد',
  beaten: 'مخفوق',
  'diced small': 'مكعبات صغيرة',
  trimmed: 'منضّف',
  'baked and broken': 'مخبوز ومفتّت',
  'bone in': 'بالعضم',
  butterflied: 'مفتوح فراشة',
  'cleaned and scored': 'منضّف ومخرّم',
  cold: 'بارد',
  cored: 'منزوع القلب',
  'cut into chunks': 'مقطّع قطع كبيرة',
  'cut into cubes': 'مقطّع مكعبات',
  'cut into fingers': 'مقطّع أصابع',
  'cut into florets': 'مقطّع زهرات',
  'cut into steaks': 'مقطّع شرايح عريضة',
  'cut into wedges': 'مقطّع فصوص',
  dried: 'ناشف',
  frozen: 'مجمّد',
  'in slabs': 'قطع كبيرة',
  'in two fillets': 'في قطعتين',
  melted: 'سايح',
  'patted dry': 'منشّف',
  peeled: 'مقشّر',
  'peeled and hollowed': 'مقشّر ومفرّغ',
  scored: 'مخرّم',
  shredded: 'مبشور خشن',
  'sliced thick': 'شرايح تخينة',
  soaked: 'منقوع',
  'strong and cooled': 'تقيلة وباردة',
  toasted: 'محمّص',
  'tops cut off': 'مقطوع من فوق',
  torn: 'مقطّع بالإيد',
  'torn and toasted': 'مقطّع بالإيد ومحمّر',
  'very finely chopped': 'مفروم ناعم جدًا',
  'very ripe': 'مستوي أوي',
  warmed: 'مسخّن',
  'a day or two old': 'بايت يوم أو اتنين',
  'crushed to a paste': 'مدقوق لحد ما يبقى عجينة',
  'for deep frying': 'للتحمير',
  'for dusting': 'للرش',
  lukewarm: 'دافي',
  'roughly chopped': 'مقطّع خشن',
  'scrubbed, skin on': 'مغسول بقشره',
  skinless: 'من غير قشر',
  'coarsely cracked': 'مجروش خشن',
  'finely grated': 'مبشور ناعم',
  husked: 'منزوع القشر',
  'peeled and sliced thin': 'مقشّر ومقطّع شرايح رفيعة',
  'rinsed until the water runs clear': 'مغسول لحد ما المية تصفّى',
  'washed and roughly chopped': 'مغسول ومقطّع خشن',
  wedges: 'فصوص',
  'bone in, skin on': 'بالعضم وبالجلد',
  'gutted and scaled, whole': 'منضّف ومقشّر وصحيح',
  'stems and leaves separated': 'العيدان مفصولة عن الورق',
};

/** Every preparation phrase this module can translate. Used by the tests. */
export const KNOWN_PREPARATIONS: readonly string[] = Object.keys(PREPARATION_AR);

/*
  WESTERN NUMERALS, APPLIED WHERE RECIPE TEXT BECOMES SCREEN TEXT.

  AKALT renders 0–9 in both languages. Anything the app FORMATS already obeys
  that, because the locale is pinned to `ar-EG-u-nu-latn`. Recipe prose is not
  formatted by the app — it is content, written by a person — and a great deal
  of the Arabic was typed with Arabic-Indic digits: «حوالي ١٥ دقيقة» next to a
  «15 min» chip the app rendered itself, in the same screen.

  NORMALISED HERE, at the single boundary all five accessors pass through, and
  NOT in the data. Three reasons:

    1. Recipes do not only come from the bundled catalogue. They come from
       Supabase and from the AI edge function at runtime, and neither goes
       anywhere near the importer. Fixing the generated file would leave both
       of those still wrong, which is the worst outcome: the bug survives in
       exactly the paths nobody screenshots.
    2. The source keeps what the author wrote.
    3. One rule in one place, the same shape as `features/commerce/display.ts`
       does for merchant text.

  `toWesternNumerals` touches digits only — never a letter, never wording.
  It is a no-op for the overwhelming majority of strings, so calling it on
  every accessor costs nothing and cannot be forgotten on one of them.
*/

export function recipeTitle(recipe: Pick<Recipe, 'title' | 'titleAr'>, language: Language): string {
  return toWesternNumerals((language === 'ar' ? recipe.titleAr : null) ?? recipe.title);
}

export function recipeDescription(
  recipe: Pick<Recipe, 'description' | 'descriptionAr'>,
  language: Language,
): string {
  return toWesternNumerals(
    (language === 'ar' ? recipe.descriptionAr : null) ?? recipe.description,
  );
}

export function stepInstruction(
  step: Pick<RecipeStep, 'instruction' | 'instructionAr'>,
  language: Language,
): string {
  return toWesternNumerals((language === 'ar' ? step.instructionAr : null) ?? step.instruction);
}

export function stepSafetyNote(
  step: Pick<RecipeStep, 'safetyNote' | 'safetyNoteAr'>,
  language: Language,
): string | null {
  const note = (language === 'ar' ? step.safetyNoteAr : null) ?? step.safetyNote;
  return note === null ? null : toWesternNumerals(note);
}

export function preparationLabel(preparation: string, language: Language): string {
  if (language !== 'ar') return toWesternNumerals(preparation);
  return toWesternNumerals(PREPARATION_AR[preparation.trim().toLowerCase()] ?? preparation);
}

/** The whole set, bound to the active language. */
export function useRecipeText() {
  const { language } = useI18n();

  return {
    title: useCallback(
      (recipe: Pick<Recipe, 'title' | 'titleAr'>) => recipeTitle(recipe, language),
      [language],
    ),
    description: useCallback(
      (recipe: Pick<Recipe, 'description' | 'descriptionAr'>) =>
        recipeDescription(recipe, language),
      [language],
    ),
    instruction: useCallback(
      (step: Pick<RecipeStep, 'instruction' | 'instructionAr'>) => stepInstruction(step, language),
      [language],
    ),
    safetyNote: useCallback(
      (step: Pick<RecipeStep, 'safetyNote' | 'safetyNoteAr'>) => stepSafetyNote(step, language),
      [language],
    ),
    preparation: useCallback(
      (preparation: string) => preparationLabel(preparation, language),
      [language],
    ),
  };
}
