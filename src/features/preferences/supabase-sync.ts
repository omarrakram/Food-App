import type { SupabaseClient } from '@supabase/supabase-js';

import { currencyForCountry } from '@/lib/format/money';
import { toAppError } from '@/lib/errors';
import type { Database } from '@/lib/supabase/database.types';
import type { CountryCode, CurrencyCode, UserPreferences } from '@/types/domain';
import { DEFAULT_PREFERENCES } from '@/types/domain';

/**
 * Reads and writes `user_preferences` and its satellite tables.
 *
 * Multi-valued preferences (allergens, cuisines, appliances, dislikes) are
 * replaced wholesale rather than diffed: the sets are tiny, and a
 * delete-then-insert inside one call is far easier to reason about than a diff
 * that could silently drop an allergen.
 */

export async function fetchRemotePreferences(
  client: SupabaseClient<Database>,
  userId: string,
): Promise<{ preferences: Partial<UserPreferences>; onboardingCompleted: boolean } | null> {
  const [profile, prefs, allergens, cuisines, appliances, dislikes] = await Promise.all([
    client.from('profiles').select('*').eq('id', userId).maybeSingle(),
    client.from('user_preferences').select('*').eq('user_id', userId).maybeSingle(),
    client.from('user_allergens').select('allergen').eq('user_id', userId),
    client.from('user_cuisines').select('cuisine').eq('user_id', userId),
    client.from('user_appliances').select('appliance').eq('user_id', userId),
    client.from('user_disliked_ingredients').select('ingredient_name').eq('user_id', userId),
  ]);

  if (profile.error) throw toAppError(profile.error, 'database');
  if (!profile.data) return null;

  const country = (profile.data.country as CountryCode) ?? DEFAULT_PREFERENCES.country;

  return {
    preferences: {
      displayName: profile.data.display_name,
      country,
      city: profile.data.city,
      currency: (prefs.data?.currency as CurrencyCode) ?? currencyForCountry(country),
      householdSize: prefs.data?.household_size ?? DEFAULT_PREFERENCES.householdSize,
      dietaryPreference: prefs.data?.dietary_preference ?? DEFAULT_PREFERENCES.dietaryPreference,
      primaryGoal: prefs.data?.primary_goal ?? DEFAULT_PREFERENCES.primaryGoal,
      skillLevel: prefs.data?.skill_level ?? DEFAULT_PREFERENCES.skillLevel,
      dailyCalorieTarget: prefs.data?.daily_calorie_target ?? null,
      dailyProteinTarget: prefs.data?.daily_protein_target ?? null,
      typicalBudgetMinor: prefs.data?.typical_budget_minor ?? null,
      personalisationEnabled: prefs.data?.personalisation_enabled ?? true,
      allergens: (allergens.data ?? []).map((row) => row.allergen),
      preferredCuisines: (cuisines.data ?? []).map((row) => row.cuisine),
      appliances: (appliances.data ?? []).map((row) => row.appliance),
      dislikedIngredients: (dislikes.data ?? []).map((row) => row.ingredient_name),
    },
    onboardingCompleted: prefs.data?.onboarding_completed ?? false,
  };
}

export async function pushRemotePreferences(
  client: SupabaseClient<Database>,
  userId: string,
  preferences: UserPreferences,
  onboardingCompleted: boolean,
): Promise<void> {
  const profileResult = await client
    .from('profiles')
    .update({
      display_name: preferences.displayName,
      country: preferences.country,
      city: preferences.city,
    })
    .eq('id', userId);
  if (profileResult.error) throw toAppError(profileResult.error, 'database');

  const prefsResult = await client.from('user_preferences').upsert(
    {
      user_id: userId,
      household_size: preferences.householdSize,
      dietary_preference: preferences.dietaryPreference,
      primary_goal: preferences.primaryGoal,
      skill_level: preferences.skillLevel,
      currency: preferences.currency,
      daily_calorie_target: preferences.dailyCalorieTarget,
      daily_protein_target: preferences.dailyProteinTarget,
      typical_budget_minor: preferences.typicalBudgetMinor,
      personalisation_enabled: preferences.personalisationEnabled,
      onboarding_completed: onboardingCompleted,
    },
    { onConflict: 'user_id' },
  );
  if (prefsResult.error) throw toAppError(prefsResult.error, 'database');

  // Replace-in-full for the set-valued preferences.
  await Promise.all([
    replaceSet(client, 'user_allergens', userId, 'allergen', preferences.allergens),
    replaceSet(client, 'user_cuisines', userId, 'cuisine', preferences.preferredCuisines),
    replaceSet(client, 'user_appliances', userId, 'appliance', preferences.appliances),
    replaceDislikes(client, userId, preferences.dislikedIngredients),
  ]);
}

type SetTable = 'user_allergens' | 'user_cuisines' | 'user_appliances';

async function replaceSet(
  client: SupabaseClient<Database>,
  table: SetTable,
  userId: string,
  column: string,
  values: readonly string[],
): Promise<void> {
  const deleteResult = await client.from(table).delete().eq('user_id', userId);
  if (deleteResult.error) throw toAppError(deleteResult.error, 'database');
  if (values.length === 0) return;

  const rows = values.map((value) => ({ user_id: userId, [column]: value }));
  // The row shape is table-dependent; the enum constraint in Postgres is the
  // real guard, so a cast here is safe and avoids four near-identical helpers.
  const insertResult = await client.from(table).insert(rows as never);
  if (insertResult.error) throw toAppError(insertResult.error, 'database');
}

async function replaceDislikes(
  client: SupabaseClient<Database>,
  userId: string,
  values: readonly string[],
): Promise<void> {
  const deleteResult = await client
    .from('user_disliked_ingredients')
    .delete()
    .eq('user_id', userId);
  if (deleteResult.error) throw toAppError(deleteResult.error, 'database');
  if (values.length === 0) return;

  const insertResult = await client.from('user_disliked_ingredients').insert(
    values.map((name) => ({
      user_id: userId,
      ingredient_name: name.slice(0, 80),
      ingredient_id: null,
    })),
  );
  if (insertResult.error) throw toAppError(insertResult.error, 'database');
}
