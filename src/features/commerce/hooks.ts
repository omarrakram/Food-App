import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useRef, useState } from 'react';

import { useRepositories } from '@/features/data/repositories';
import { INGREDIENTS_BY_SLUG } from '@/features/ingredients/catalogue';
import { usePreferences } from '@/features/preferences/preferences-provider';
import { perPieceWeightFor } from '@/features/pricing/units';
import { toAppError } from '@/lib/errors';
import { queryKeys } from '@/lib/query/client';
import { newId } from '@/lib/storage/local-collection';
import type { Cart, MerchantProduct } from '@/types/commerce';
import type { IngredientMatch } from '@/types/domain';

import type { AddressInput } from './address-repository';
import { addableLines } from './basket';
import type { AddCartLineInput } from './cart-repository';
import { buildCartView, type CartView } from './cart-view';
import {
  acceptanceIsCurrent,
  checkoutReadiness,
  type ReviewAcceptance,
} from './checkout-readiness';
import { selectMerchant, type SelectedMerchant } from './merchant-selection';
import {
  OrderDraftRefused,
  type OrderDraft,
  type OrderDraftFailure,
} from './order-draft';
import { clearPendingCart, readPendingCart } from './pending-cart';
import type { SourcedLine, SourcingResult } from './ports';
import { requirementsFor, type RequirementsResult } from './requirements';
import { revalidateCart } from './revalidation';
import {
  requiredDietsFor,
  sourceRequest,
  type SourcingCandidateInput,
  type SourcingContext,
} from './sourcing';

/**
 * Commerce hooks.
 *
 * The engines below them are pure and synchronous; these exist to bind them to
 * the user's preferences, the selected branch and the cache. No ranking, no
 * pack arithmetic and no eligibility rule lives here.
 */

/** The branch we are sourcing against, or null when ordering is not possible. */
export function useSelectedMerchant(): SelectedMerchant | null {
  const { preferences } = usePreferences();
  return useMemo(() => selectMerchant(preferences.country), [preferences.country]);
}

/**
 * The user's hard exclusions, straight from their own preferences.
 *
 * BOTH AXES, read here rather than passed in, so no screen can source a basket
 * while forgetting somebody's allergies or their diet. The eating style and
 * the diet flags are separate fields because a halal keto vegetarian is an
 * ordinary person; `requiredDietsFor` folds them into the one list the sourcer
 * asks about.
 */
function useSourcingContext(): SourcingContext {
  const { preferences } = usePreferences();

  return useMemo(
    () => ({
      avoidAllergens: preferences.allergens,
      requireDiets: requiredDietsFor(preferences.dietaryPreference, preferences.dietFlags),
      perPieceFor: (slug: string) => perPieceWeightFor(INGREDIENTS_BY_SLUG.get(slug) ?? null),
    }),
    [preferences.allergens, preferences.dietaryPreference, preferences.dietFlags],
  );
}

export type RecipeSourcing = {
  readonly merchant: SelectedMerchant;
  readonly requirements: RequirementsResult;
  readonly result: SourcingResult;
  /** Lines safe to add without asking: matched, eligible, purchasable. */
  readonly addable: readonly SourcedLine[];
};

/**
 * Sources one recipe's missing ingredients against the selected branch.
 *
 * Returns null — rather than an empty result — when no branch can be selected,
 * so a screen renders its "not available here" state instead of an empty
 * basket that looks like a shop with nothing in it.
 */
export function useRecipeSourcing(
  recipeId: string,
  missing: readonly IngredientMatch[],
): RecipeSourcing | null {
  const merchant = useSelectedMerchant();
  const context = useSourcingContext();

  return useMemo(() => {
    if (!merchant) return null;

    const requirements = requirementsFor(missing, recipeId);
    const result = sourceRequest(
      {
        lines: requirements.lines,
        merchantId: merchant.merchant.id,
        locationId: merchant.location.id,
      },
      merchant.candidatesFor,
      context,
    );

    return {
      merchant,
      requirements,
      result,
      addable: addableLines(result),
    };
  }, [merchant, context, missing, recipeId]);
}

export function useCart() {
  const { cart, scopeKey } = useRepositories();

  return useQuery({
    queryKey: queryKeys.cart(scopeKey),
    queryFn: async () => {
      try {
        return await cart.get();
      } catch (error) {
        throw toAppError(error, 'database');
      }
    },
  });
}

export function useCartMutations() {
  const { cart, scopeKey } = useRepositories();
  const queryClient = useQueryClient();
  const key = queryKeys.cart(scopeKey);

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: key });
  }, [queryClient, key]);

  const addLines = useMutation({
    mutationFn: async (inputs: readonly AddCartLineInput[]) => {
      try {
        return await cart.addLines(inputs);
      } catch (error) {
        throw toAppError(error, 'database');
      }
    },
    onSuccess: invalidate,
  });

  const setQuantity = useMutation({
    mutationFn: async ({ lineId, quantity }: { lineId: string; quantity: number }) => {
      try {
        return await cart.setQuantity(lineId, quantity);
      } catch (error) {
        throw toAppError(error, 'database');
      }
    },
    onSuccess: invalidate,
  });

  const removeLine = useMutation({
    mutationFn: async (lineId: string) => {
      try {
        return await cart.removeLine(lineId);
      } catch (error) {
        throw toAppError(error, 'database');
      }
    },
    onSuccess: invalidate,
  });

  const clear = useMutation({
    mutationFn: async () => {
      try {
        await cart.clear();
      } catch (error) {
        throw toAppError(error, 'database');
      }
    },
    onSuccess: invalidate,
  });

  return { addLines, setQuantity, removeLine, clear };
}

/** Turns sourced lines into cart inputs. One place, so the mapping is one rule. */
export function toCartInputs(
  sourcing: RecipeSourcing,
  lines: readonly SourcedLine[],
  recipeId: string,
): AddCartLineInput[] {
  const inputs: AddCartLineInput[] = [];

  for (const line of lines) {
    const chosen = line.chosen;
    // Both guards are `addableLines`' rules restated at the point money is
    // committed. Callers are supposed to pass addable lines; this makes a
    // caller that does not fail quietly rather than expensively.
    if (!chosen || chosen.packsNeeded === null) continue;

    inputs.push({
      merchantId: sourcing.merchant.merchant.id,
      locationId: sourcing.merchant.location.id,
      currency: sourcing.merchant.merchant.currency,
      merchantProductId: chosen.product.id,
      quantity: chosen.packsNeeded,
      unitPrice: chosen.product.price,
      sourceIngredientSlug: line.requested.ingredientSlug,
      sourceRecipeId: recipeId,
    });
  }

  return inputs;
}

/**
 * Why a cart cannot be shown, when it cannot.
 *
 * `unknown_merchant` is the one that matters: a cart whose branch is no longer
 * selectable — the demo catalogue switched off, a partner withdrawn — must not
 * render as an ordinary basket, because none of its prices can be trusted and
 * none of its lines can be ordered.
 */
export type CartProblem = 'unknown_merchant';

export type CartState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly error: unknown; readonly refetch: () => void }
  | { readonly kind: 'empty' }
  | { readonly kind: 'problem'; readonly problem: CartProblem; readonly cart: Cart }
  | { readonly kind: 'ready'; readonly view: CartView; readonly isRefreshing: boolean };

/**
 * The catalogue rows for a cart's lines.
 *
 * Separate from the cart query because they have different lifetimes: the cart
 * is the user's own durable state, these are a read of somebody else's shelf
 * that is stale the moment it lands.
 */
function useCartProducts(
  merchant: SelectedMerchant | null,
  cart: Cart | null | undefined,
): { products: ReadonlyMap<string, MerchantProduct>; isFetching: boolean } {
  const ids = useMemo(
    () => (cart ? cart.lines.map((line) => line.merchantProductId) : []),
    [cart],
  );

  const enabled = Boolean(merchant) && ids.length > 0 && cart?.merchantId === merchant?.merchant.id;

  const query = useQuery({
    queryKey: queryKeys.merchantProducts(merchant?.location.id ?? 'none', ids),
    enabled,
    queryFn: async () => {
      if (!merchant) return [] as readonly MerchantProduct[];
      try {
        return await merchant.catalogue.getProducts(ids);
      } catch (error) {
        throw toAppError(error, 'database');
      }
    },
  });

  const products = useMemo(() => {
    const map = new Map<string, MerchantProduct>();
    for (const product of query.data ?? []) map.set(product.id, product);
    return map;
  }, [query.data]);

  return { products, isFetching: query.isFetching };
}

/**
 * Everything the cart screen needs, as one discriminated state.
 *
 * TOTALS ARE COMPUTED FROM THE SNAPSHOT PRICES, not from the catalogue read.
 * The snapshot is what the user was shown when they added the line, and
 * silently re-totalling a basket underneath somebody is how a shop loses an
 * argument about what they agreed to pay. A changed price is SURFACED per line
 * instead; reconciling it belongs to checkout, which does not exist yet.
 */
export function useCartView(): CartState {
  const merchant = useSelectedMerchant();
  const { data: cart, isLoading, isError, error, refetch } = useCart();
  const { products, isFetching } = useCartProducts(merchant, cart);

  const refetchCart = useCallback(() => {
    void refetch();
  }, [refetch]);

  return useMemo<CartState>(() => {
    if (isLoading) return { kind: 'loading' };
    if (isError) return { kind: 'error', error, refetch: refetchCart };
    if (!cart || cart.lines.length === 0) return { kind: 'empty' };

    if (!merchant || merchant.merchant.id !== cart.merchantId) {
      return { kind: 'problem', problem: 'unknown_merchant', cart };
    }

    return {
      kind: 'ready',
      isRefreshing: isFetching,
      view: buildCartView(cart, merchant, products),
    };
  }, [cart, isLoading, isError, error, refetchCart, merchant, products, isFetching]);
}

export type { CartLineView, CartView } from './cart-view';

// --- Addresses --------------------------------------------------------------

export function useAddresses() {
  const { addresses, scopeKey } = useRepositories();

  return useQuery({
    queryKey: queryKeys.addresses(scopeKey),
    queryFn: async () => {
      try {
        return await addresses.list();
      } catch (error) {
        throw toAppError(error, 'database');
      }
    },
  });
}

/**
 * The areas an address can be in.
 *
 * Reference data: it changes when a merchant signs a new district, not when
 * the user does anything, so it is cached hard and refetched rarely.
 */
export function useDeliveryAreas() {
  const { addresses, scopeKey } = useRepositories();

  return useQuery({
    queryKey: queryKeys.deliveryAreas(scopeKey),
    staleTime: 60 * 60 * 1000,
    queryFn: async () => {
      try {
        return await addresses.listAreas();
      } catch (error) {
        throw toAppError(error, 'database');
      }
    },
  });
}

export function useAddressMutations() {
  const { addresses, scopeKey } = useRepositories();
  const queryClient = useQueryClient();
  const key = queryKeys.addresses(scopeKey);

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: key });
  }, [queryClient, key]);

  const create = useMutation({
    mutationFn: (input: AddressInput) => addresses.create(input),
    onSuccess: invalidate,
  });

  const update = useMutation({
    mutationFn: ({ id, input }: { id: string; input: AddressInput }) =>
      addresses.update(id, input),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: (id: string) => addresses.remove(id),
    onSuccess: invalidate,
  });

  return { create, update, remove };
}

// --- The parked guest cart ---------------------------------------------------

/**
 * The conflict from sign-in, if there is one.
 *
 * Read on the CART surface and resolved there. Checkout cannot begin while it
 * is open — which basket the customer means is an open question until they
 * say, and validating one of two candidates is meaningless.
 */
export function usePendingCart() {
  const { scopeKey, isRemote } = useRepositories();

  return useQuery({
    queryKey: ['akla', 'pending-cart', scopeKey] as const,
    // Only a signed-in account can have one: it is parked BY signing in.
    enabled: isRemote,
    queryFn: () => readPendingCart(scopeKey),
  });
}

export function usePendingCartActions() {
  const { cart, scopeKey, isRemote } = useRepositories();
  const queryClient = useQueryClient();

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['akla', 'pending-cart', scopeKey] });
    void queryClient.invalidateQueries({ queryKey: queryKeys.cart(scopeKey) });
  }, [queryClient, scopeKey]);

  /** Keep what the account already had; the parked basket is dropped. */
  const keepCurrent = useMutation({
    mutationFn: () => clearPendingCart(),
    onSuccess: invalidate,
  });

  /**
   * Take the parked basket instead.
   *
   * Replays its lines through `addLines`, which replaces by branch under the
   * one-cart-one-merchant rule. The parked PRICES are carried so the restored
   * cart looks like the one the guest left — they are not checkout truth, and
   * revalidation re-reads the shelf before any order exists.
   */
  const switchToPending = useMutation({
    mutationFn: async () => {
      if (!isRemote) throw new Error('no account to switch a cart for');
      const pending = await readPendingCart(scopeKey);
      if (!pending) return;

      await cart.addLines(
        pending.lines.map((line) => ({
          merchantId: pending.merchantId,
          locationId: pending.locationId,
          currency: pending.currency,
          merchantProductId: line.merchantProductId,
          quantity: line.quantity,
          unitPrice: line.unitPriceSnapshot,
          sourceIngredientSlug: line.sourceIngredientSlug,
          sourceRecipeId: line.sourceRecipeId,
        })),
      );
      // Only after the replacement has succeeded.
      await clearPendingCart();
    },
    onSuccess: invalidate,
  });

  return { keepCurrent, switchToPending };
}

// --- Checkout ----------------------------------------------------------------

/**
 * The one place the checkout question is asked.
 *
 * Pulls the cart, the chosen address, the branch and a fresh catalogue read,
 * runs the domain revalidation against them, and hands the result to the
 * single readiness gate. Screens render the verdict; they do not recompute it.
 */
export function useCheckout(addressId: string | null) {
  const { scopeKey, isRemote, cart: cartRepository, orders } = useRepositories();
  const merchant = useSelectedMerchant();
  const context = useSourcingContext();
  const { data: cart } = useCart();
  const { data: addresses } = useAddresses();
  const { data: pending } = usePendingCart();
  const queryClient = useQueryClient();

  const [held, setAcceptance] = useState<ReviewAcceptance | null>(null);

  const address = useMemo(
    () => addresses?.find((entry) => entry.id === addressId) ?? null,
    [addresses, addressId],
  );

  const productIds = useMemo(
    () => (cart ? cart.lines.map((line) => line.merchantProductId) : []),
    [cart],
  );

  /**
   * A FRESH read of every product in the basket.
   *
   * Keyed by revision as well as by ids: a validation verdict belongs to a
   * revision, so caching the read across revisions would let a stale answer
   * survive a change to the very basket it describes.
   */
  const catalogue = useQuery({
    queryKey: queryKeys.cartValidation(scopeKey, cart?.revision ?? -1),
    enabled: Boolean(merchant && cart && cart.lines.length > 0),
    queryFn: async () => {
      if (!merchant) return [] as readonly SourcingCandidateInput[];
      const products = await merchant.catalogue.getProducts(productIds);
      return products.map((product) => ({
        product,
        // The mapping is not what is being judged here — eligibility and
        // purchasability are — so a synthetic verified mapping keeps the
        // shared gate honest without pretending to re-derive matching.
        mapping: {
          id: `revalidate-${product.id}`,
          ingredientSlug: '',
          merchantProductId: product.id,
          confidence: 1,
          source: 'manual' as const,
          isVerified: true,
          verifiedAt: null,
          verifiedBy: null,
          isBlocked: false,
          createdAt: product.fetchedAt,
          updatedAt: product.fetchedAt,
        },
        productAllergens: merchant.allergensFor(product.id),
        productDiets: merchant.dietsFor(product.id),
      }));
    },
  });

  const validation = useMemo(() => {
    if (!cart || !merchant || !catalogue.data) return null;
    return revalidateCart({
      cart,
      revision: cart.revision,
      merchant: merchant.merchant,
      location: merchant.location,
      products: new Map(catalogue.data.map((entry) => [entry.product.id, entry])),
      address,
      context,
    });
  }, [cart, merchant, catalogue.data, address, context]);

  /**
   * AN ACCEPTANCE BELONGS TO ONE REVISION.
   *
   * Filtered here during render rather than cleared in an effect. An effect
   * would leave one render in which a stale acceptance was still live, and
   * that render is the one where the CTA is enabled for a basket the customer
   * has not seen the prices of.
   */
  const acceptance = acceptanceIsCurrent(held, cart ?? null) ? held : null;

  const readiness = useMemo(
    () =>
      checkoutReadiness({
        isAuthenticated: isRemote,
        hasPendingCartConflict: Boolean(pending),
        cart: cart ?? null,
        address,
        validation,
        acceptance,
      }),
    [isRemote, pending, cart, address, validation, acceptance],
  );

  /**
   * "I have seen the new prices."
   *
   * Refreshes the cart's snapshots to what the shelf now says, which bumps the
   * revision, and records the acceptance against THAT revision. Validation
   * then runs again on the new basket, and is what decides whether it can
   * proceed — this only removes the review, never a blocker.
   */
  const acceptChanges = useMutation({
    mutationFn: async () => {
      if (!cart || !catalogue.data) return;
      const shelf = new Map(
        catalogue.data.map((entry) => [entry.product.id, entry.product.price] as const),
      );

      const refreshed = await cartRepository.refreshPrices(shelf);
      if (!refreshed) return;
      setAcceptance({ revision: refreshed.revision, acceptedAt: new Date().toISOString() });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.cart(scopeKey) });
    },
  });

  /**
   * ONE ATTEMPT, ONE KEY.
   *
   * Regenerated when the basket or the destination changes — that is a
   * different order — and held otherwise, so a double tap, a dropped response
   * or an app resumed from the background all resolve to the draft that
   * already exists rather than to a second one.
   *
   * A ref rather than state: it must not re-render anything, and it must
   * survive a render that state would not.
   */
  const attempt = useRef<{ revision: number; addressId: string; key: string } | null>(null);
  const idempotencyKeyFor = useCallback((revision: number, id: string) => {
    const held = attempt.current;
    if (held && held.revision === revision && held.addressId === id) return held.key;
    const key = newId();
    attempt.current = { revision, addressId: id, key };
    return key;
  }, []);

  /**
   * The outcome of the last attempt, TAGGED WITH THE ATTEMPT IT BELONGS TO.
   *
   * Same reasoning as the acceptance: a draft describes one basket going to
   * one address, so it is filtered during render rather than cleared in an
   * effect. A reference number left on screen after the basket changed is a
   * receipt for something that is no longer being bought.
   */
  const [outcome, setOutcome] = useState<{
    readonly revision: number;
    readonly addressId: string | null;
    readonly draft: OrderDraft | null;
    readonly refusal: OrderDraftFailure | null;
  } | null>(null);

  const current =
    outcome && outcome.revision === cart?.revision && outcome.addressId === addressId
      ? outcome
      : null;
  const draft = current?.draft ?? null;
  const refusal = current?.refusal ?? null;

  /**
   * Ask the server for the draft.
   *
   * CLIENT VALIDATION IS UX; this is where authority is. Everything the
   * readiness gate concluded is re-derived inside `create_order_draft` against
   * locked rows, and a refusal from there is the truth even when the screen
   * said the order was ready.
   */
  const prepareDraft = useMutation({
    mutationFn: async (): Promise<OrderDraft> => {
      if (!readiness.canProceedToDraft || readiness.revision === null || !address) {
        throw new OrderDraftRefused('unknown');
      }
      return orders.create({
        cartRevision: readiness.revision,
        addressId: address.id,
        idempotencyKey: idempotencyKeyFor(readiness.revision, address.id),
        customerNote: null,
      });
    },
    onSuccess: (created) => {
      setOutcome({
        revision: cart?.revision ?? -1,
        addressId,
        draft: created,
        refusal: null,
      });
    },
    onError: (error) => {
      setOutcome({
        revision: cart?.revision ?? -1,
        addressId,
        draft: null,
        refusal: error instanceof OrderDraftRefused ? error.failure : 'unknown',
      });
      // The server disagreed with the screen. Re-read the shelf so the customer
      // is shown WHY rather than left looking at the verdict that was wrong.
      void queryClient.invalidateQueries({ queryKey: queryKeys.cart(scopeKey) });
    },
  });

  return {
    merchant,
    cart: cart ?? null,
    address,
    validation,
    readiness,
    acceptance,
    acceptChanges,
    prepareDraft,
    draft,
    refusal,
    isValidating: catalogue.isFetching,
    revalidate: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.cartValidation(scopeKey, cart?.revision ?? -1),
      });
    },
  };
}
