# Grocery providers

Everything the app knows about supermarkets goes through `GroceryProvider`.
No screen, engine, or database column names a specific retailer.

## Status

**No real provider is implemented.** V1 registers `MockGroceryProvider` only,
with `isEnabled: false`, so ordering is never reachable in a production build.
The UI shows "Order ingredients" and explains that delivery partners are not
live yet.

This is a commercial blocker, not a technical one — see PROJECT_STATUS.md
§ Required credentials.

## Adding a provider

1. Implement `GroceryProvider` in `providers/<name>.ts`.
2. Read credentials **server-side only** — a store API key must never be an
   `EXPO_PUBLIC_*` variable. Route the calls through an edge function exactly
   as `ai-suggest` does.
3. `registerProvider(new YourProvider())` in `registry.ts`.
4. Insert a row in `grocery_providers` with `is_enabled = true`. RLS hides
   disabled providers from clients, so the row is the deployment switch.
5. Set `EXPO_PUBLIC_ENABLE_GROCERY_ORDERING=true`.

Both gates must be open: the feature flag and the provider's own `isEnabled`.
A flag flipped early cannot expose a half-finished integration.

## Optional capabilities

A provider that only supports a deep-link handoff implements `createCart` and
`checkout` and throws `GroceryUnsupportedError` from `getOrderStatus`. The app
never assumes every provider does everything.

## Matching

`matchItem` returns a confidence score. Below `MATCH_CONFIRM_THRESHOLD` the
match is offered to the user for confirmation rather than applied — buying the
wrong thing on someone's behalf is worse than asking.

## Prices

A `StoreProduct.price` is a LIVE price and must be surfaced as
`PricedAmount { source: 'live', storeName }`. Never merge it into an estimate:
the estimate/live distinction is a product rule, and `PriceTag` is the only
component allowed to render either.
