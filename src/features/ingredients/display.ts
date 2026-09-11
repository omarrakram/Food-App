import { useCallback } from 'react';

import { useI18n, type Language } from '@/i18n';

import { resolveIngredient } from './matching';

/**
 * The name to SHOW for an ingredient.
 *
 * Ingredient names are stored canonically in English — the matching engine,
 * the price book and the shopping list all key off one spelling, and making
 * that spelling depend on the user's language would mean a pantry written in
 * Arabic could not be matched against a recipe written in English.
 *
 * So the canonical name stays English and the DISPLAY name is resolved here.
 * The catalogue already carries `nameAr` for all 257 entries; this is the only
 * thing standing between that data and the screen.
 *
 * Anything the catalogue does not know is shown exactly as the user typed it.
 * Inventing a transliteration for someone's own words would be worse than
 * leaving them alone.
 */
export function ingredientDisplayName(name: string, language: Language): string {
  if (language !== 'ar') return name;
  return resolveIngredient(name)?.nameAr ?? name;
}

/** `ingredientDisplayName` bound to the active language. */
export function useIngredientName(): (name: string) => string {
  const { language } = useI18n();
  return useCallback((name: string) => ingredientDisplayName(name, language), [language]);
}
