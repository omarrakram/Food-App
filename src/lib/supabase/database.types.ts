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

export type DeliveryAddressRow = {
  id: string;
  user_id: string;
  label: string | null;
  recipient_name: string;
  /** E.164. The column has a check constraint; the client normalises. */
  phone: string;
  /** References `delivery_areas.key`. Null only on a half-finished row. */
  area_key: string | null;
  street: string;
  building: string;
  floor: string | null;
  apartment: string | null;
  landmark: string | null;
  country: string;
  notes: string | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
};

export type DeliveryAreaRow = {
  key: string;
  governorate: string;
  name_en: string;
  name_ar: string;
  is_demo: boolean;
  created_at: string;
  updated_at: string;
};

export type MerchantLocationAreaRow = {
  merchant_location_id: string;
  area_key: string;
  created_at: string;
};

export type CartRow = {
  id: string;
  user_id: string;
  merchant_id: string;
  merchant_location_id: string;
  currency: string;
  /** Bumped by the `cart_lines_bump_revision` trigger. Never written by us. */
  revision: number;
  created_at: string;
  updated_at: string;
};

export type CartLineRow = {
  id: string;
  cart_id: string;
  merchant_product_id: string;
  source_ingredient_slug: string | null;
  source_recipe_id: string | null;
  quantity: number;
  unit_price_minor: number;
  added_at: string;
};

/**
 * Commerce enums, as the database declares them.
 *
 * Restated here rather than imported from `@/types/commerce` on purpose: this
 * file describes the WIRE, and `db:types:check` verifies these literals
 * against the migrations. A domain type that drifts from the column is exactly
 * the bug that check exists to catch, and it cannot catch it if both sides are
 * the same declaration.
 */
export type OrderFulfilmentStateEnum =
  | 'draft'
  | 'pending'
  | 'placed'
  | 'accepted'
  | 'picking'
  | 'ready'
  | 'dispatched'
  | 'delivered'
  | 'rejected'
  | 'cancelled'
  | 'failed'
  | 'undeliverable';

export type PaymentStateEnum =
  | 'unpaid'
  | 'authorising'
  | 'authorised'
  | 'captured'
  | 'partially_refunded'
  | 'refunded'
  | 'voided'
  | 'failed';

export type PaymentMethodEnum = 'card' | 'wallet' | 'cash_on_delivery';
export type PaymentProviderEnum = 'demo' | 'paymob' | 'fawry' | 'cash';
export type SubstitutionPreferenceEnum = 'contact_me' | 'best_match' | 'remove';
export type SubstitutionDecisionEnum =
  | 'pending_customer'
  | 'approved'
  | 'rejected'
  | 'auto_approved'
  | 'removed';
export type MerchantRoleEnum = 'admin' | 'operator';
/**
 * One attempt to send money back. `abandoned` means automatic retry has
 * stopped and a person must check the provider — not that the debt is gone.
 */
export type RefundAttemptStateEnum =
  | 'pending'
  | 'processing'
  | 'succeeded'
  | 'failed'
  | 'abandoned';

/**
 * An order row, READ-ONLY from the client.
 *
 * `create_order_draft` is the only writer — the insert policy that used to let
 * a client name its own totals was dropped in the checkout migration — so this
 * has no Insert or Update type. Everything financial here is the server's
 * arithmetic, not ours.
 */
export type OrderRow = {
  id: string;
  reference: string;
  user_id: string;
  merchant_id: string;
  merchant_location_id: string;
  fulfilment_state: OrderFulfilmentStateEnum;
  payment_state: PaymentStateEnum;
  /** Null until a payment path is chosen. A draft has not chosen one. */
  payment_method: PaymentMethodEnum | null;
  payment_provider: PaymentProviderEnum | null;
  payment_reference: string | null;
  substitution_preference: SubstitutionPreferenceEnum;
  currency: string;
  items_subtotal_minor: number;
  delivery_fee_minor: number;
  service_fee_minor: number;
  discount_minor: number;
  captured_minor: number;
  refunded_minor: number;
  commission_rate_basis_points: number;
  merchant_keeps_delivery_fee: boolean;
  delivery_address_id: string | null;
  delivery_snapshot: Record<string, unknown>;
  contact_phone: string;
  customer_note: string | null;
  /** The merchant's own rider. AKALT has no riders and no rider accounts. */
  rider_name: string | null;
  rider_phone: string | null;
  delivered_at: string | null;
  rejected_reason: string | null;
  /** The cart revision the draft was built from. */
  cart_revision: number | null;
  checkout_idempotency_key: string | null;
  /** After this, `begin_payment` refuses. Written by `create_order_draft`. */
  draft_expires_at: string | null;
  paid_at: string | null;
  placed_at: string | null;
  created_at: string;
  updated_at: string;
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

/**
 * How far along ONE attempt to pay is.
 *
 * Deliberately not the same vocabulary as `payment_state`. That column answers
 * where the money is, for the whole order. This one answers what happened when
 * we tried, for a single attempt — and an order can sit in `failed` while a
 * `succeeded` intent is thirty seconds away.
 *
 * (No apostrophes in this block on purpose: `db:types:check` reads string
 * literals with a naive quote pair, and a lone apostrophe in a comment shifts
 * every literal after it.)
 */
export type PaymentIntentStateEnum =
  | 'requires_action'
  | 'processing'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'expired';

/**
 * One attempt to pay for one order. READ-ONLY from the client.
 *
 * `begin_payment`, `record_payment_event` and `cancel_payment_intent` are the
 * only writers, and only the last two can say a payment succeeded. There is no
 * insert or update policy for a client to use.
 */
export type PaymentIntentRow = {
  id: string;
  order_id: string;
  user_id: string;
  provider: PaymentProviderEnum;
  method: PaymentMethodEnum;
  /** Copied from the order when the attempt began. Never sent by the client. */
  amount_minor: number;
  currency: string;
  state: PaymentIntentStateEnum;
  provider_intention_id: string | null;
  provider_order_id: string | null;
  provider_reference: string | null;
  /**
   * Client-facing by design: the checkout URL carries it beside a public key.
   * The secret key and the HMAC secret never reach the database.
   */
  checkout_client_secret: string | null;
  checkout_url: string | null;
  idempotency_key: string;
  failure_code: string | null;
  failure_message: string | null;
  refunded_minor: number;
  provider_metadata: Record<string, unknown>;
  expires_at: string | null;
  settled_at: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * The append-only provider callback log.
 *
 * Typed for the edge function; no client query reads it, and it has no read
 * policy at all — the payloads are raw provider bodies.
 */
export type PaymentEventRow = {
  id: string;
  payment_intent_id: string | null;
  provider: PaymentProviderEnum;
  kind: string;
  provider_event_id: string;
  disposition: string;
  payload: Record<string, unknown>;
  received_at: string;
};

/**
 * Somebody who works in the shop.
 *
 * READ-ONLY from the client, and only your own row: a merchant staff list is
 * not something another member needs. Rows are created out of band for V1.
 */
export type MerchantMembershipRow = {
  id: string;
  merchant_id: string;
  user_id: string;
  /** Null means every branch of this merchant. */
  merchant_location_id: string | null;
  role: MerchantRoleEnum;
  created_at: string;
  updated_at: string;
};

/**
 * A product on one branch's shelf. READ-ONLY from the client.
 *
 * `allergens_published` is the field the child table cannot express: a product
 * with no rows in `merchant_product_allergens` is either one the merchant
 * declared free of them or one they published nothing about, and for somebody
 * with an allergy those are opposite answers.
 */
export type MerchantProductRow = {
  id: string;
  merchant_location_id: string;
  external_id: string;
  sku: string | null;
  name: string;
  name_ar: string | null;
  brand: string | null;
  unit: MeasurementUnitEnum | null;
  pack_quantity: number | null;
  price_minor: number | null;
  currency: string;
  availability: AvailabilityStatusEnum;
  image_url: string | null;
  is_active: boolean;
  allergens_published: boolean;
  fetched_at: string;
};

/** One line of an order. Read-only: written by `create_order_draft`. */
export type OrderItemRow = {
  id: string;
  order_id: string;
  merchant_product_id: string | null;
  product_name: string;
  product_name_ar: string | null;
  sku: string | null;
  pack_quantity: number | null;
  pack_unit: MeasurementUnitEnum | null;
  quantity: number;
  unit_price_minor: number;
  line_total_minor: number;
  source_ingredient_slug: string | null;
  source_recipe_id: string | null;
};

/**
 * What happened instead of the line that was ordered.
 *
 * The original `order_items` row is never deleted; this sits beside it. Read
 * only — `report_item_unavailable` and `decide_substitution` are the writers.
 */
export type OrderSubstitutionRow = {
  id: string;
  order_id: string;
  order_item_id: string;
  original_product_id: string | null;
  original_product_name: string;
  original_unit_price_minor: number;
  replacement_product_id: string | null;
  replacement_product_name: string | null;
  replacement_unit_price_minor: number | null;
  unit_price_delta_minor: number;
  quantity: number;
  decision: SubstitutionDecisionEnum;
  decided_at: string | null;
  decided_by: string | null;
  proposed_by: CommerceActorEnum;
  reason: string | null;
  /** After this, silence becomes a removal rather than a stalled order. */
  expires_at: string | null;
  created_at: string;
};

/** Append-only. An order's financial position is a fold over these. */
export type OrderAdjustmentRow = {
  id: string;
  order_id: string;
  order_item_id: string | null;
  kind: AdjustmentKindEnum;
  /** Signed minor units. Negative reduces what the customer owes. */
  amount_minor: number;
  reason: string | null;
  actor: CommerceActorEnum;
  actor_id: string | null;
  created_at: string;
};

/** The audit trail. Every status change appends one. */
export type OrderEventRow = {
  id: string;
  order_id: string;
  kind: OrderEventKindEnum;
  actor: CommerceActorEnum;
  actor_id: string | null;
  from_value: string | null;
  to_value: string | null;
  note: string | null;
  at: string;
};

export type CommerceActorEnum = 'customer' | 'merchant' | 'akalt' | 'system';
export type AdjustmentKindEnum =
  | 'substitution'
  | 'item_removed'
  | 'quantity_reduced'
  | 'order_cancelled'
  | 'fee_waived'
  | 'goodwill';
export type OrderEventKindEnum =
  | 'fulfilment_state'
  | 'payment_state'
  | 'adjustment'
  | 'substitution'
  | 'note';

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
      delivery_addresses: Table<
        DeliveryAddressRow,
        Omit<DeliveryAddressRow, 'id' | 'created_at' | 'updated_at' | 'is_default'> & {
          id?: string;
          is_default?: boolean;
        }
      >;
      delivery_areas: Table<DeliveryAreaRow, DeliveryAreaRow>;
      merchant_location_areas: Table<MerchantLocationAreaRow, MerchantLocationAreaRow>;
      // Read-only: `create_order_draft` is the only writer, and there is no
      // insert or update policy for a client to use.
      orders: Table<OrderRow, never, never>;
      // Same rule, and the stakes are higher: a client that could write here
      // could write itself a succeeded payment.
      payment_intents: Table<PaymentIntentRow, never, never>;
      merchant_memberships: Table<MerchantMembershipRow, never, never>;
      merchant_products: Table<MerchantProductRow, never, never>;
      order_items: Table<OrderItemRow, never, never>;
      order_substitutions: Table<OrderSubstitutionRow, never, never>;
      order_adjustments: Table<OrderAdjustmentRow, never, never>;
      order_events: Table<OrderEventRow, never, never>;
      payment_events: Table<PaymentEventRow, never, never>;
      carts: Table<
        CartRow,
        Omit<CartRow, 'id' | 'created_at' | 'updated_at' | 'revision'> & { id?: string }
      >;
      cart_lines: Table<
        CartLineRow,
        Omit<CartLineRow, 'id' | 'added_at'> & { id?: string; added_at?: string }
      >;
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
      /**
       * Starts one attempt to pay. The AMOUNT IS DERIVED FROM THE ORDER —
       * there is deliberately no way to name it here.
       */
      begin_payment: {
        Args: { p_order_id: string; p_method: PaymentMethodEnum; p_idempotency_key: string };
        Returns: PaymentIntentRow;
      };
      cancel_payment_intent: { Args: { p_intent_id: string }; Returns: undefined };
      /** The ONLY way a fulfilment status changes. Idempotent. */
      advance_fulfilment: {
        Args: {
          p_order_id: string;
          p_to: OrderFulfilmentStateEnum;
          p_reason?: string | null;
          p_rider_name?: string | null;
          p_rider_phone?: string | null;
        };
        Returns: OrderFulfilmentStateEnum;
      };
      report_item_unavailable: {
        Args: {
          p_order_item_id: string;
          p_replacement_product_id?: string | null;
          p_reason?: string | null;
        };
        Returns: string;
      };
      decide_substitution: {
        Args: { p_substitution_id: string; p_accept: boolean };
        Returns: SubstitutionDecisionEnum;
      };
      /** Five distinct facts; a calculated refund is not a paid one. */
      order_refund_position: {
        Args: { p_order_id: string };
        Returns: {
          currency: string;
          captured_minor: number;
          items_subtotal_minor: number;
          fulfilled_goods_minor: number;
          amount_due_minor: number;
          refunded_minor: number;
          refund_required_minor: number;
        }[];
      };
      /**
       * The ledger position joined to the most recent refund attempt.
       *
       * `attempt_state` is `refund_attempt_state` widened to text because the
       * left join can produce no attempt at all; the app narrows it against
       * REFUND_ATTEMPT_STATES rather than trusting the column.
       */
      order_refund_status: {
        Args: { p_order_id: string };
        Returns: {
          currency: string;
          captured_minor: number;
          refunded_minor: number;
          refund_required_minor: number;
          attempt_state: string | null;
          attempt_amount_minor: number | null;
          needs_review: boolean;
          last_error_code: string | null;
          requested_at: string | null;
          settled_at: string | null;
        }[];
      };
      /** Queues a refund. The amount is derived server-side; there is no way to name one. */
      request_refund: {
        Args: { p_order_id: string; p_reason?: string | null; p_idempotency_key?: string | null };
        Returns: string;
      };
      /** Merchant staff for one merchant. Managers and AKALT admins only. */
      merchant_staff: {
        Args: { p_merchant: string };
        Returns: {
          membership_id: string;
          user_id: string;
          email: string;
          role: MerchantRoleEnum;
          merchant_location_id: string | null;
          created_at: string;
        }[];
      };
      /** Invitations addressed to the caller's own email address. */
      my_merchant_invites: {
        Args: Record<string, never>;
        Returns: {
          id: string;
          token: string;
          merchant_id: string;
          merchant_name: string;
          merchant_location_id: string | null;
          role: MerchantRoleEnum;
          expires_at: string;
        }[];
      };
      /** Returns the invitation id and its token. Sending it is the caller's job. */
      invite_merchant_staff: {
        Args: {
          p_merchant: string;
          p_email: string;
          p_role?: MerchantRoleEnum;
          p_location?: string | null;
        };
        Returns: { id: string; token: string; expires_at: string }[];
      };
      /** The email on the account must match the invitation. Returns the membership id. */
      accept_merchant_invite: { Args: { p_token: string }; Returns: string };
      revoke_merchant_invite: { Args: { p_invite_id: string }; Returns: boolean };
      revoke_merchant_access: { Args: { p_membership_id: string }; Returns: boolean };
      /** True only when the basket cleared is the one that was actually paid for. */
      clear_paid_cart: { Args: { p_order_id: string }; Returns: boolean };
      /** Returns the new order's id. Every figure is derived server-side. */
      create_order_draft: {
        Args: {
          p_cart_revision: number;
          p_address_id: string;
          p_idempotency_key: string;
          p_customer_note?: string | null;
        };
        Returns: string;
      };
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
      order_fulfilment_state: OrderFulfilmentStateEnum;
      payment_state: PaymentStateEnum;
      payment_method: PaymentMethodEnum;
      payment_provider: PaymentProviderEnum;
      substitution_preference: SubstitutionPreferenceEnum;
      payment_intent_state: PaymentIntentStateEnum;
      substitution_decision: SubstitutionDecisionEnum;
      merchant_role: MerchantRoleEnum;
      commerce_actor: CommerceActorEnum;
      adjustment_kind: AdjustmentKindEnum;
      order_event_kind: OrderEventKindEnum;
    };
    CompositeTypes: Record<string, never>;
  };
};
