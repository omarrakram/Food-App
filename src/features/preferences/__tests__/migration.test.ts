import { mergePreferences } from '@/features/preferences/preferences-provider';
import { DEFAULT_PREFERENCES, type UserPreferences } from '@/types/domain';

/**
 * Diet used to be one field holding both the eating style and the halal/keto
 * flags, which meant choosing "halal" silently erased "vegetarian". These cover
 * the upgrade path for everyone who onboarded before the split.
 */
describe('preference migration: diet', () => {
  it('MOVES a legacy halal choice into flags and frees the eating style', () => {
    const merged = mergePreferences(DEFAULT_PREFERENCES, {
      dietaryPreference: 'halal',
    } as unknown as Partial<UserPreferences>);

    expect(merged.dietaryPreference).toBe('none');
    expect(merged.dietFlags).toEqual(['halal']);
  });

  it('moves a legacy keto choice the same way', () => {
    const merged = mergePreferences(DEFAULT_PREFERENCES, {
      dietaryPreference: 'keto',
    } as unknown as Partial<UserPreferences>);

    expect(merged.dietaryPreference).toBe('none');
    expect(merged.dietFlags).toEqual(['keto']);
  });

  it('keeps a real eating style untouched', () => {
    const merged = mergePreferences(DEFAULT_PREFERENCES, { dietaryPreference: 'vegan' });

    expect(merged.dietaryPreference).toBe('vegan');
    expect(merged.dietFlags).toEqual([]);
  });

  it('maps the retired "other" value to no restriction rather than leaving it unmatched', () => {
    const merged = mergePreferences(DEFAULT_PREFERENCES, {
      dietaryPreference: 'other',
    } as unknown as Partial<UserPreferences>);

    expect(merged.dietaryPreference).toBe('none');
    expect(merged.dietFlags).toEqual([]);
  });

  it('is idempotent, so hydrating twice cannot duplicate a flag', () => {
    const once = mergePreferences(DEFAULT_PREFERENCES, {
      dietaryPreference: 'halal',
    } as unknown as Partial<UserPreferences>);
    const twice = mergePreferences(once, once);

    expect(twice.dietFlags).toEqual(['halal']);
    expect(twice.dietaryPreference).toBe('none');
  });

  it('lets a style and both flags coexist — the combination the old model could not express', () => {
    const merged = mergePreferences(DEFAULT_PREFERENCES, {
      dietaryPreference: 'vegetarian',
      dietFlags: ['halal', 'keto'],
    });

    expect(merged.dietaryPreference).toBe('vegetarian');
    expect(merged.dietFlags).toEqual(['halal', 'keto']);
  });
});
