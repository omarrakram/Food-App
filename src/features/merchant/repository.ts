import type { SupabaseClient } from '@supabase/supabase-js';

import { toAppError } from '@/lib/errors';
import type {
  Database,
  MerchantMembershipRow,
  OrderEventRow,
  OrderItemRow,
  OrderSubstitutionRow,
} from '@/lib/supabase/database.types';
import type {
  MerchantMembership,
  OrderFulfilmentState,
  SubstitutionDecision,
  SubstitutionPreference,
} from '@/types/commerce';
import type { CurrencyCode, Money } from '@/types/domain';

/**
 * The shop's side of an order.
 *
 * EVERY WRITE GOES THROUGH AN RPC. There is no update policy on `orders`, so
 * this could not set a status by writing a column even if it tried — which is
 * the point: the dashboard is a web page, and a web page can be driven by
 * anything.
 *
 * Reads are ordinary selects and are answered by RLS. A merchant who queries
 * another merchant's order id gets nothing, not an error, because an error
 * would confirm the order exists.
 */

export type MerchantQueueOrder = {
  readonly id: string;
  readonly reference: string;
  readonly fulfilment: OrderFulfilmentState;
  readonly currency: CurrencyCode;
  readonly total: Money;
  readonly placedAt: string | null;
  readonly createdAt: string;
  readonly itemCount: number;
  /** How many lines are still waiting on the customer to answer. */
  readonly pendingSubstitutions: number;
  readonly substitutionPreference: SubstitutionPreference;
  /** Frozen at placement. The address book is NOT readable by the merchant. */
  readonly deliverTo: {
    readonly recipientName: string;
    readonly phone: string;
    readonly street: string;
    readonly building: string;
    readonly floor: string | null;
    readonly apartment: string | null;
    readonly landmark: string | null;
    readonly areaKey: string;
    readonly notes: string | null;
  };
  readonly customerNote: string | null;
  readonly riderName: string | null;
};

export type MerchantOrderItem = {
  readonly id: string;
  readonly productName: string;
  readonly productNameAr: string | null;
  readonly sku: string | null;
  readonly quantity: number;
  readonly unitPrice: Money;
  readonly lineTotal: Money;
  readonly packQuantity: number | null;
  readonly packUnit: string | null;
};

export type MerchantSubstitution = {
  readonly id: string;
  readonly orderItemId: string;
  readonly originalProductName: string;
  readonly originalUnitPrice: Money;
  readonly replacementProductName: string | null;
  readonly replacementUnitPrice: Money | null;
  readonly quantity: number;
  readonly decision: SubstitutionDecision;
  readonly reason: string | null;
  readonly expiresAt: string | null;
  readonly createdAt: string;
};

export type OrderEvent = {
  readonly id: string;
  readonly kind: string;
  readonly actor: string;
  readonly from: string | null;
  readonly to: string | null;
  readonly note: string | null;
  readonly at: string;
};

/** Five facts the shop and the customer both need, and must not conflate. */
export type RefundPosition = {
  readonly currency: CurrencyCode;
  readonly captured: Money;
  readonly fulfilledGoods: Money;
  readonly amountDue: Money;
  readonly refunded: Money;
  /** CALCULATED, not paid. Nothing in Commerce-6 executes a refund. */
  readonly refundRequired: Money;
};

export type MerchantOrderDetail = {
  readonly order: MerchantQueueOrder;
  readonly items: readonly MerchantOrderItem[];
  readonly substitutions: readonly MerchantSubstitution[];
  readonly events: readonly OrderEvent[];
  readonly refund: RefundPosition;
};

export interface MerchantRepository {
  /** The shops this operator may act for. Empty for an ordinary customer. */
  memberships(): Promise<readonly MerchantMembership[]>;
  queue(states: readonly OrderFulfilmentState[]): Promise<readonly MerchantQueueOrder[]>;
  order(orderId: string): Promise<MerchantOrderDetail | null>;
  advance(input: {
    readonly orderId: string;
    readonly to: OrderFulfilmentState;
    readonly reason?: string | null;
    readonly riderName?: string | null;
    readonly riderPhone?: string | null;
  }): Promise<OrderFulfilmentState>;
  reportUnavailable(input: {
    readonly orderItemId: string;
    readonly replacementProductId?: string | null;
    readonly reason?: string | null;
  }): Promise<string>;
  /** Replacements the shop may legitimately offer for this line. */
  replacementsFor(orderItemId: string): Promise<readonly ReplacementOption[]>;
}

export type ReplacementOption = {
  readonly id: string;
  readonly name: string;
  readonly price: Money;
  /** False when it is dearer, out of stock, or unsafe for this customer. */
  readonly offerable: boolean;
  readonly reason: 'ok' | 'costs_more' | 'unavailable' | 'not_suitable';
};

/** No merchant surface without a server. A guest is not staff. */
export class LocalMerchantRepository implements MerchantRepository {
  async memberships(): Promise<readonly MerchantMembership[]> {
    return [];
  }
  async queue(): Promise<readonly MerchantQueueOrder[]> {
    return [];
  }
  async order(): Promise<MerchantOrderDetail | null> {
    return null;
  }
  async advance(): Promise<OrderFulfilmentState> {
    throw new Error('merchant actions need an account');
  }
  async reportUnavailable(): Promise<string> {
    throw new Error('merchant actions need an account');
  }
  async replacementsFor(): Promise<readonly ReplacementOption[]> {
    return [];
  }
}

const ORDER_COLUMNS =
  'id, reference, fulfilment_state, currency, items_subtotal_minor, delivery_fee_minor, service_fee_minor, discount_minor, placed_at, created_at, substitution_preference, delivery_snapshot, customer_note, rider_name';

type OrderRowShape = {
  id: string;
  reference: string;
  fulfilment_state: OrderFulfilmentState;
  currency: string;
  items_subtotal_minor: number;
  delivery_fee_minor: number;
  service_fee_minor: number;
  discount_minor: number;
  placed_at: string | null;
  created_at: string;
  substitution_preference: SubstitutionPreference;
  delivery_snapshot: Record<string, unknown>;
  customer_note: string | null;
  rider_name: string | null;
};

function money(amountMinor: number, currency: CurrencyCode): Money {
  return { amountMinor, currency };
}

function toQueueOrder(
  row: OrderRowShape,
  counts: { items: number; pending: number },
): MerchantQueueOrder {
  const currency = row.currency as CurrencyCode;
  const snapshot = row.delivery_snapshot ?? {};
  const text = (key: string): string => String(snapshot[key] ?? '');
  const optional = (key: string): string | null =>
    snapshot[key] === null || snapshot[key] === undefined ? null : String(snapshot[key]);

  return {
    id: row.id,
    reference: row.reference,
    fulfilment: row.fulfilment_state,
    currency,
    total: money(
      row.items_subtotal_minor + row.delivery_fee_minor + row.service_fee_minor - row.discount_minor,
      currency,
    ),
    placedAt: row.placed_at,
    createdAt: row.created_at,
    itemCount: counts.items,
    pendingSubstitutions: counts.pending,
    substitutionPreference: row.substitution_preference,
    deliverTo: {
      recipientName: text('recipientName'),
      phone: text('phone'),
      street: text('street'),
      building: text('building'),
      floor: optional('floor'),
      apartment: optional('apartment'),
      landmark: optional('landmark'),
      areaKey: text('areaKey'),
      notes: optional('notes'),
    },
    customerNote: row.customer_note,
    riderName: row.rider_name,
  };
}

export class SupabaseMerchantRepository implements MerchantRepository {
  constructor(
    private readonly client: SupabaseClient<Database>,
    private readonly userId: string,
  ) {}

  async memberships(): Promise<readonly MerchantMembership[]> {
    const { data, error } = await this.client
      .from('merchant_memberships')
      .select('*')
      .eq('user_id', this.userId);

    if (error) throw toAppError(error, 'database');
    return (data ?? []).map((row: MerchantMembershipRow) => ({
      id: row.id,
      merchantId: row.merchant_id,
      userId: row.user_id,
      locationId: row.merchant_location_id,
      role: row.role,
      createdAt: row.created_at,
    }));
  }

  /**
   * The queue.
   *
   * NO MERCHANT FILTER IS APPLIED HERE, and that is deliberate: the policy
   * already restricts this to orders of merchants the caller is a member of.
   * Adding a client-side `eq('merchant_id', …)` would look like the security
   * and quietly become it the day somebody removes the policy.
   */
  async queue(states: readonly OrderFulfilmentState[]): Promise<readonly MerchantQueueOrder[]> {
    const { data, error } = await this.client
      .from('orders')
      .select(ORDER_COLUMNS)
      .in('fulfilment_state', states as OrderFulfilmentState[])
      .order('placed_at', { ascending: true, nullsFirst: false });

    if (error) throw toAppError(error, 'database');
    const rows = (data ?? []) as unknown as OrderRowShape[];
    if (rows.length === 0) return [];

    const ids = rows.map((row) => row.id);
    const [items, pending] = await Promise.all([
      this.client.from('order_items').select('order_id').in('order_id', ids),
      this.client
        .from('order_substitutions')
        .select('order_id')
        .in('order_id', ids)
        .eq('decision', 'pending_customer'),
    ]);

    const count = (list: { order_id: string }[] | null, id: string) =>
      (list ?? []).filter((entry) => entry.order_id === id).length;

    return rows.map((row) =>
      toQueueOrder(row, {
        items: count(items.data as { order_id: string }[] | null, row.id),
        pending: count(pending.data as { order_id: string }[] | null, row.id),
      }),
    );
  }

  async order(orderId: string): Promise<MerchantOrderDetail | null> {
    const { data, error } = await this.client
      .from('orders')
      .select(ORDER_COLUMNS)
      .eq('id', orderId)
      .maybeSingle();

    if (error) throw toAppError(error, 'database');
    if (!data) return null;
    const row = data as unknown as OrderRowShape;
    const currency = row.currency as CurrencyCode;

    const [items, subs, events, position] = await Promise.all([
      this.client.from('order_items').select('*').eq('order_id', orderId),
      this.client.from('order_substitutions').select('*').eq('order_id', orderId),
      this.client
        .from('order_events')
        .select('*')
        .eq('order_id', orderId)
        .order('at', { ascending: true }),
      this.client.rpc('order_refund_position', { p_order_id: orderId }),
    ]);

    const substitutions = ((subs.data ?? []) as OrderSubstitutionRow[]).map((sub) => ({
      id: sub.id,
      orderItemId: sub.order_item_id,
      originalProductName: sub.original_product_name,
      originalUnitPrice: money(sub.original_unit_price_minor, currency),
      replacementProductName: sub.replacement_product_name,
      replacementUnitPrice:
        sub.replacement_unit_price_minor === null
          ? null
          : money(sub.replacement_unit_price_minor, currency),
      quantity: sub.quantity,
      decision: sub.decision,
      reason: sub.reason,
      expiresAt: sub.expires_at,
      createdAt: sub.created_at,
    }));

    const financial = (position.data ?? [])[0];

    return {
      order: toQueueOrder(row, {
        items: (items.data ?? []).length,
        pending: substitutions.filter((sub) => sub.decision === 'pending_customer').length,
      }),
      items: ((items.data ?? []) as OrderItemRow[]).map((item) => ({
        id: item.id,
        productName: item.product_name,
        productNameAr: item.product_name_ar,
        sku: item.sku,
        quantity: item.quantity,
        unitPrice: money(item.unit_price_minor, currency),
        lineTotal: money(item.line_total_minor, currency),
        packQuantity: item.pack_quantity,
        packUnit: item.pack_unit,
      })),
      substitutions,
      events: ((events.data ?? []) as OrderEventRow[]).map((event) => ({
        id: event.id,
        kind: event.kind,
        actor: event.actor,
        from: event.from_value,
        to: event.to_value,
        note: event.note,
        at: event.at,
      })),
      refund: {
        currency,
        captured: money(financial?.captured_minor ?? 0, currency),
        fulfilledGoods: money(financial?.fulfilled_goods_minor ?? 0, currency),
        amountDue: money(financial?.amount_due_minor ?? 0, currency),
        refunded: money(financial?.refunded_minor ?? 0, currency),
        refundRequired: money(financial?.refund_required_minor ?? 0, currency),
      },
    };
  }

  async advance(input: {
    orderId: string;
    to: OrderFulfilmentState;
    reason?: string | null;
    riderName?: string | null;
    riderPhone?: string | null;
  }): Promise<OrderFulfilmentState> {
    const { data, error } = await this.client.rpc('advance_fulfilment', {
      p_order_id: input.orderId,
      p_to: input.to,
      p_reason: input.reason ?? null,
      p_rider_name: input.riderName ?? null,
      p_rider_phone: input.riderPhone ?? null,
    });

    if (error) throw toAppError(error, 'database');
    return data as OrderFulfilmentState;
  }

  async reportUnavailable(input: {
    orderItemId: string;
    replacementProductId?: string | null;
    reason?: string | null;
  }): Promise<string> {
    const { data, error } = await this.client.rpc('report_item_unavailable', {
      p_order_item_id: input.orderItemId,
      p_replacement_product_id: input.replacementProductId ?? null,
      p_reason: input.reason ?? null,
    });

    if (error) throw toAppError(error, 'database');
    return String(data);
  }

  /**
   * What the shop may offer instead.
   *
   * A SHORTLIST, NOT A DECISION. The server re-derives every one of these
   * rules inside `report_item_unavailable` — safety, stock, and the
   * equal-or-cheaper price rule — so an operator who somehow sends an
   * unofferable id is refused there. This exists so the list they are shown is
   * already true.
   */
  async replacementsFor(orderItemId: string): Promise<readonly ReplacementOption[]> {
    const { data: item, error } = await this.client
      .from('order_items')
      .select('merchant_product_id, unit_price_minor, source_ingredient_slug, order_id')
      .eq('id', orderItemId)
      .maybeSingle();

    if (error) throw toAppError(error, 'database');
    if (!item?.merchant_product_id) return [];

    const { data: original } = await this.client
      .from('merchant_products')
      .select('merchant_location_id, currency')
      .eq('id', item.merchant_product_id)
      .maybeSingle();

    if (!original) return [];
    const currency = original.currency as CurrencyCode;

    const { data: candidates } = await this.client
      .from('merchant_products')
      .select('id, name, price_minor, availability, is_active')
      .eq('merchant_location_id', original.merchant_location_id)
      .eq('is_active', true)
      .neq('id', item.merchant_product_id)
      .limit(40);

    return (candidates ?? [])
      .map((candidate): ReplacementOption => {
        const price = candidate.price_minor ?? 0;
        const reason: ReplacementOption['reason'] =
          candidate.availability === 'out_of_stock'
            ? 'unavailable'
            : price > item.unit_price_minor
              ? 'costs_more'
              : 'ok';

        return {
          id: candidate.id,
          name: candidate.name,
          price: money(price, currency),
          offerable: reason === 'ok',
          reason,
        };
      })
      .sort((a, b) => Number(b.offerable) - Number(a.offerable) || a.name.localeCompare(b.name));
  }
}
