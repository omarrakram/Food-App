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

export type ProfileVisibilityEnum = 'public' | 'friends' | 'private';

export type FriendRequestStatusEnum = 'pending' | 'accepted' | 'declined' | 'cancelled';

export type FriendRequestRow = {
  id: string;
  sender_id: string;
  recipient_id: string;
  status: FriendRequestStatusEnum;
  created_at: string;
  responded_at: string | null;
};

/** Ids are stored low-high, enforced by `friendships_ordered`. */
export type FriendshipRow = {
  user_low_id: string;
  user_high_id: string;
  created_at: string;
};

export type BlockRow = {
  blocker_id: string;
  blocked_id: string;
  created_at: string;
};

export type ConversationRow = {
  id: string;
  created_at: string;
  /** Denormalised from the newest message, maintained by a trigger. */
  last_message_at: string;
  last_message_body: string | null;
};

export type ConversationMemberRow = {
  conversation_id: string;
  user_id: string;
  joined_at: string;
  last_read_at: string;
};

export type MessageRow = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  /** A reference, never copied content. */
  shared_recipe_id: string | null;
  created_at: string;
  edited_at: string | null;
};

export type SubmissionStatusEnum =
  | 'draft'
  | 'pending'
  | 'changes_requested'
  | 'approved'
  | 'rejected';

export type ModerationActionEnum =
  | 'submit'
  | 'resubmit'
  | 'approve'
  | 'reject'
  | 'request_changes'
  | 'withdraw';

export type AppRoleEnum = 'moderator' | 'admin';

export type UserRoleRow = {
  user_id: string;
  role: AppRoleEnum;
  granted_at: string;
  granted_by: string | null;
};

export type RecipeSubmissionRow = {
  id: string;
  recipe_id: string;
  author_id: string;
  status: SubmissionStatusEnum;
  revision: number;
  submitted_at: string | null;
  decided_at: string | null;
  decided_by: string | null;
  /** The feedback the AUTHOR sees. Internal history lives elsewhere. */
  author_note: string | null;
  created_at: string;
  updated_at: string;
};

export type ModerationEventRow = {
  id: string;
  submission_id: string;
  actor_id: string | null;
  action: ModerationActionEnum;
  note: string | null;
  revision: number;
  created_at: string;
};

export type NotificationKindEnum =
  | 'friend_request'
  | 'friend_accepted'
  | 'message'
  | 'recipe_shared'
  | 'submission_approved'
  | 'submission_rejected'
  | 'submission_changes_requested';

export type NotificationRow = {
  id: string;
  user_id: string;
  kind: NotificationKindEnum;
  actor_id: string | null;
  /** A pointer to whatever it is about. The kind says which table. */
  subject_id: string | null;
  read_at: string | null;
  created_at: string;
};

export type ProfileRow = {
  id: string;
  display_name: string | null;
  /** Handle as typed. Null until the user claims one. */
  username: string | null;
  /** Case- and separator-folded handle. Generated by Postgres; never written. */
  username_key: string | null;
  bio: string | null;
  country: string;
  city: string | null;
  locale: string;
  avatar_url: string | null;
  visibility: ProfileVisibilityEnum;
  show_city: boolean;
  created_at: string;
  updated_at: string;
};

/**
 * What another user may see. The complete set — see `public_profiles` in the
 * migration for why it is enumerated rather than derived from ProfileRow.
 */
export type PublicProfileRow = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  country: string;
  city: string | null;
  joined_at: string;
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
  /** Generated: prep_minutes + cook_minutes. Read-only, indexed, filterable. */
  total_minutes: number;
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
      profiles: Table<
        ProfileRow,
        // `username_key` is generated by Postgres, so it is never written.
        Partial<Omit<ProfileRow, 'username_key'>> & { id: string }
      >;
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
      friend_requests: Table<
        FriendRequestRow,
        { sender_id: string; recipient_id: string; status?: FriendRequestStatusEnum },
        Partial<Pick<FriendRequestRow, 'status' | 'responded_at'>>
      >;
      // No Insert type worth naming: there is no insert policy, and the only
      // route to a row is `accept_friend_request`.
      friendships: Table<FriendshipRow, never, never>;
      blocks: Table<BlockRow, { blocker_id: string; blocked_id: string }, never>;
      // No write policy: created by `start_conversation`, previewed by a
      // trigger, and touched by nothing else.
      conversations: Table<ConversationRow, never, never>;
      conversation_members: Table<
        ConversationMemberRow,
        never,
        Pick<ConversationMemberRow, 'last_read_at'>
      >;
      messages: Table<
        MessageRow,
        {
          conversation_id: string;
          sender_id: string;
          body: string;
          shared_recipe_id?: string | null;
        },
        Pick<MessageRow, 'body' | 'edited_at'>
      >;
      // Read-only to every client. The absence of an Insert and an Update
      // type is the schema's own rule restated: `user_roles` has no write
      // policy at all, so a grant is a service-role operation and nothing
      // else.
      user_roles: Table<UserRoleRow, never, never>;
      recipe_submissions: Table<
        RecipeSubmissionRow,
        // An author files a DRAFT. Everything past that is a function call —
        // `submit_recipe` and `moderate_submission` — because a status a
        // client can write is a status a client can set to 'approved'.
        { recipe_id: string; author_id: string; status?: 'draft' },
        Partial<Pick<RecipeSubmissionRow, 'author_note'>>
      >;
      // Append-only, and written by the definer functions. A moderation log a
      // moderator can edit is not a log.
      moderation_events: Table<ModerationEventRow, never, never>;
      // No Insert type: rows are written by triggers, and the table has no
      // insert policy. A client that could write one could put anything in
      // anybody's feed.
      notifications: Table<NotificationRow, never, Pick<NotificationRow, 'read_at'>>;
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
    Views: {
      // Read-only: no Insert or Update. supabase-js needs `Relationships` on
      // every relation it resolves, views included — omitting it collapses the
      // whole `Tables` union and every `.update()` in the app types as `never`.
      public_profiles: { Row: PublicProfileRow; Relationships: [] };
    };
    Functions: {
      delete_own_account: { Args: Record<string, never>; Returns: undefined };
      clear_own_history: { Args: Record<string, never>; Returns: undefined };
      username_available: { Args: { candidate: string }; Returns: boolean };
      are_friends: { Args: { a: string; b: string }; Returns: boolean };
      blocked_between: { Args: { a: string; b: string }; Returns: boolean };
      accept_friend_request: { Args: { request_id: string }; Returns: undefined };
      block_user: { Args: { target: string }; Returns: undefined };
      blocked_profiles: { Args: Record<string, never>; Returns: PublicProfileRow[] };
      is_conversation_member: { Args: { conversation: string; who: string }; Returns: boolean };
      conversation_partner: { Args: { conversation: string }; Returns: string | null };
      start_conversation: { Args: { partner: string }; Returns: string };
      unread_counts: {
        Args: Record<string, never>;
        Returns: { conversation_id: string; unread: number }[];
      };
      has_role: { Args: { who: string; wanted: AppRoleEnum }; Returns: boolean };
      is_moderator: { Args: Record<string, never>; Returns: boolean };
      is_admin: { Args: Record<string, never>; Returns: boolean };
      submit_recipe: { Args: { submission: string }; Returns: SubmissionStatusEnum };
      withdraw_submission: { Args: { submission: string }; Returns: SubmissionStatusEnum };
      moderate_submission: {
        Args: { submission: string; decision: ModerationActionEnum; feedback?: string | null };
        Returns: SubmissionStatusEnum;
      };
      unpublish_recipe: { Args: { target: string; reason: string }; Returns: undefined };
      unread_notification_count: { Args: Record<string, never>; Returns: number };
      mark_all_notifications_read: { Args: Record<string, never>; Returns: undefined };
      moderation_queue: {
        Args: Record<string, never>;
        Returns: {
          submission_id: string;
          recipe_id: string;
          title: string;
          author_id: string;
          author_name: string | null;
          author_handle: string | null;
          status: SubmissionStatusEnum;
          revision: number;
          submitted_at: string | null;
        }[];
      };
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
      profile_visibility: ProfileVisibilityEnum;
      friend_request_status: FriendRequestStatusEnum;
      recipe_image_source: RecipeImageSourceEnum;
      submission_status: SubmissionStatusEnum;
      moderation_action: ModerationActionEnum;
      app_role: AppRoleEnum;
      notification_kind: NotificationKindEnum;
    };
    CompositeTypes: Record<string, never>;
  };
};
