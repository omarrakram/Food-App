/**
 * Database types.
 *
 * Hand-maintained to match `supabase/migrations/`. Regenerate against a live
 * project with:
 *
 *   npm run db:types      # supabase gen types typescript --local
 *
 * Keep the two in step: this file is what makes every query in the app typed,
 * and a drift here is a runtime error that TypeScript will not catch.
 */

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export type DietaryPreferenceEnum =
  | 'none'
  | 'vegetarian'
  | 'vegan'
  | 'pescatarian'
  | 'halal'
  | 'keto'
  | 'other';

export type AllergenEnum =
  | 'nuts'
  | 'peanuts'
  | 'dairy'
  | 'eggs'
  | 'gluten'
  | 'shellfish'
  | 'fish'
  | 'soy'
  | 'sesame';

export type GoalEnum =
  | 'cheaper'
  | 'healthier'
  | 'high_protein'
  | 'lose_weight'
  | 'gain_muscle'
  | 'cook_faster'
  | 'good_food';

export type SkillLevelEnum = 'beginner' | 'intermediate' | 'advanced';

export type ApplianceEnum =
  | 'stove'
  | 'oven'
  | 'air_fryer'
  | 'microwave'
  | 'grill'
  | 'blender'
  | 'kettle'
  | 'other';

export type CuisineEnum =
  | 'egyptian'
  | 'levantine'
  | 'italian'
  | 'asian'
  | 'indian'
  | 'mexican'
  | 'american'
  | 'mediterranean'
  | 'turkish';

export type MealTypeEnum = 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'dessert';
export type DifficultyEnum = 'easy' | 'medium' | 'hard';
export type RecipeSourceEnum = 'curated' | 'ai_generated' | 'user';
export type RecipeImageSourceEnum = 'generated' | 'owned' | 'openly_licensed' | 'community';
export type HistoryKindEnum = 'viewed' | 'cooked' | 'disliked';

export type IngredientCategoryEnum =
  | 'protein'
  | 'vegetables'
  | 'fruit'
  | 'dairy'
  | 'carbs'
  | 'spices'
  | 'sauces'
  | 'frozen'
  | 'bakery'
  | 'pantry'
  | 'other';

export type MeasurementUnitEnum =
  | 'g'
  | 'kg'
  | 'ml'
  | 'l'
  | 'piece'
  | 'clove'
  | 'slice'
  | 'bunch'
  | 'can'
  | 'pack'
  | 'tbsp'
  | 'tsp'
  | 'cup'
  | 'pinch'
  | 'to_taste';

export type AvailabilityStatusEnum = 'in_stock' | 'low_stock' | 'out_of_stock' | 'unknown';

// --- Row shapes ------------------------------------------------------------

export type ProfileRow = {
  id: string;
  display_name: string | null;
  country: string;
  city: string | null;
  locale: string;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
};

export type UserPreferencesRow = {
  user_id: string;
  household_size: number;
  dietary_preference: DietaryPreferenceEnum;
  primary_goal: GoalEnum;
  skill_level: SkillLevelEnum;
  currency: string;
  daily_calorie_target: number | null;
  daily_protein_target: number | null;
  typical_budget_minor: number | null;
  personalisation_enabled: boolean;
  onboarding_completed: boolean;
  created_at: string;
  updated_at: string;
};

export type PantryItemRow = {
  id: string;
  user_id: string;
  ingredient_id: string | null;
  ingredient_name: string;
  category: IngredientCategoryEnum;
  quantity: number | null;
  unit: MeasurementUnitEnum | null;
  expires_on: string | null;
  is_staple: boolean;
  note: string | null;
  created_at: string;
  updated_at: string;
};

export type RecipeRow = {
  id: string;
  slug: string | null;
  title: string;
  title_ar: string | null;
  description: string;
  description_ar: string | null;
  image_path: string | null;
  image_source: RecipeImageSourceEnum | null;
  image_creator: string | null;
  image_license: string | null;
  image_attribution: string | null;
  image_source_url: string | null;
  image_url: string | null;
  source: RecipeSourceEnum;
  cuisine: CuisineEnum | null;
  difficulty: DifficultyEnum;
  prep_minutes: number;
  cook_minutes: number;
  base_servings: number;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  fiber_g: number | null;
  created_by: string | null;
  is_public: boolean;
  created_at: string;
  updated_at: string;
};

export type RecipeIngredientRow = {
  id: string;
  recipe_id: string;
  ingredient_id: string | null;
  slug: string | null;
  name: string;
  quantity: number | null;
  unit: MeasurementUnitEnum | null;
  preparation: string | null;
  is_optional: boolean;
  is_garnish: boolean;
  is_pantry_staple: boolean;
  notes: string | null;
  sort_order: number;
};

export type RecipeStepRow = {
  id: string;
  recipe_id: string;
  step_number: number;
  instruction: string;
  instruction_ar: string | null;
  duration_minutes: number | null;
  safety_note: string | null;
  safety_note_ar: string | null;
  ingredient_refs: string[];
};

export type ShoppingListRow = {
  id: string;
  user_id: string;
  name: string;
  is_default: boolean;
  created_at: string;
  updated_at: string;
};

export type ShoppingListItemRow = {
  id: string;
  list_id: string;
  ingredient_id: string | null;
  name: string;
  quantity: number | null;
  unit: MeasurementUnitEnum | null;
  category: IngredientCategoryEnum;
  is_checked: boolean;
  source_recipe_ids: string[];
  supermarket_id: string | null;
  store_product_id: string | null;
  sku: string | null;
  live_price_minor: number | null;
  availability: AvailabilityStatusEnum | null;
  created_at: string;
  updated_at: string;
};

export type SavedRecipeRow = {
  id: string;
  user_id: string;
  recipe_id: string;
  created_at: string;
};

export type RecipeHistoryRow = {
  id: string;
  user_id: string;
  recipe_id: string;
  kind: HistoryKindEnum;
  occurred_at: string;
};

export type IngredientPriceEstimateRow = {
  id: string;
  ingredient_id: string;
  country: string;
  currency: string;
  unit: MeasurementUnitEnum;
  quantity: number;
  estimated_low_minor: number;
  estimated_avg_minor: number;
  estimated_high_minor: number;
  origin: string;
  last_updated: string;
};

type Table<Row, Insert = Partial<Row>, Update = Partial<Row>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: {
      profiles: Table<ProfileRow, Partial<ProfileRow> & { id: string }>;
      user_preferences: Table<UserPreferencesRow, Partial<UserPreferencesRow> & { user_id: string }>;
      user_allergens: Table<{ user_id: string; allergen: AllergenEnum; created_at: string }>;
      user_cuisines: Table<{ user_id: string; cuisine: CuisineEnum }>;
      user_appliances: Table<{ user_id: string; appliance: ApplianceEnum }>;
      user_disliked_ingredients: Table<{
        user_id: string;
        ingredient_name: string;
        ingredient_id: string | null;
        created_at: string;
      }>;
      pantry_items: Table<
        PantryItemRow,
        Omit<PantryItemRow, 'id' | 'created_at' | 'updated_at'> & { id?: string }
      >;
      recipes: Table<RecipeRow, Partial<RecipeRow> & { title: string }>;
      recipe_ingredients: Table<RecipeIngredientRow>;
      recipe_steps: Table<RecipeStepRow>;
      recipe_meal_types: Table<{ recipe_id: string; meal_type: MealTypeEnum }>;
      recipe_diet_tags: Table<{ recipe_id: string; diet: DietaryPreferenceEnum }>;
      recipe_allergens: Table<{ recipe_id: string; allergen: AllergenEnum }>;
      recipe_appliances: Table<{ recipe_id: string; appliance: ApplianceEnum }>;
      recipe_tags: Table<{ recipe_id: string; tag: string }>;
      saved_recipes: Table<SavedRecipeRow, { user_id: string; recipe_id: string }>;
      recipe_history: Table<
        RecipeHistoryRow,
        { user_id: string; recipe_id: string; kind: HistoryKindEnum; occurred_at?: string }
      >;
      shopping_lists: Table<ShoppingListRow, Partial<ShoppingListRow> & { user_id: string }>;
      shopping_list_items: Table<
        ShoppingListItemRow,
        Omit<ShoppingListItemRow, 'id' | 'created_at' | 'updated_at'> & { id?: string }
      >;
      ingredient_price_estimates: Table<IngredientPriceEstimateRow>;
      ai_usage_events: Table<{
        id: string;
        user_id: string | null;
        function_name: string;
        model: string;
        input_tokens: number;
        output_tokens: number;
        latency_ms: number | null;
        status: string;
        retry_count: number;
        created_at: string;
      }>;
    };
    Views: Record<string, never>;
    Functions: {
      delete_own_account: { Args: Record<string, never>; Returns: undefined };
      clear_own_history: { Args: Record<string, never>; Returns: undefined };
    };
    Enums: {
      dietary_preference: DietaryPreferenceEnum;
      allergen: AllergenEnum;
      user_goal: GoalEnum;
      skill_level: SkillLevelEnum;
      appliance: ApplianceEnum;
      cuisine: CuisineEnum;
      meal_type: MealTypeEnum;
      difficulty: DifficultyEnum;
      recipe_source: RecipeSourceEnum;
      history_kind: HistoryKindEnum;
      ingredient_category: IngredientCategoryEnum;
      measurement_unit: MeasurementUnitEnum;
      availability_status: AvailabilityStatusEnum;
    };
    CompositeTypes: Record<string, never>;
  };
};
