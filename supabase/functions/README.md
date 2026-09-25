# Edge functions

Server-side operations. **Every secret the app depends on lives here and only
here** — the mobile bundle can reach none of it.

| Function | Purpose |
|---|---|
| `ai-suggest` | Generates recipes for a meal request |
| `ai-interpret` | Decomposes a natural-language query the deterministic parser could not |

## Why these are functions and not client code

The Anthropic API key cannot be shipped in an app bundle. Everything else
follows from that: the caller is identified from their Supabase JWT, rate
limits are counted from a table clients cannot write to, and prompts stay
server-side so they are neither exposed nor editable.

## Secrets

```bash
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
supabase secrets set ANTHROPIC_MODEL=claude-opus-5          # optional
supabase secrets set ANTHROPIC_EFFORT=medium                # low|medium|high|xhigh|max
supabase secrets set AI_RATE_LIMIT_PER_HOUR=30
supabase secrets set AI_RATE_LIMIT_PER_DAY=150
supabase secrets set ALLOWED_ORIGINS=https://app.example.com   # web builds only
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are
injected by the platform.

## Deploy

```bash
supabase functions deploy ai-suggest
supabase functions deploy ai-interpret
supabase functions deploy payments-begin

# THE WEBHOOK TAKES NO JWT. Paymob has no Supabase token; its HMAC signature
# is the authentication, and it is verified before a single field of the body
# is read. Deploying this WITH jwt verification silently breaks every payment
# callback — the provider retries, gets 401, and the order never settles.
supabase functions deploy payments-webhook --no-verify-jwt
```

### Both integrations must reach the webhook

`notification_url` on the Intention is documented as supported with CARD
integration ids. A wallet integration ignores it and uses the processed
callback configured against the integration itself. So the card side is
configured in code and the wallet side is configured in Paymob's dashboard,
and **a deploy is not finished until both point at the same endpoint**:

| | where it is set | must be |
|---|---|---|
| CARD integration callback | `notification_url`, sent by `payments-begin` | `<FUNCTIONS_BASE_URL>/payments-webhook` |
| WALLET integration callback | Paymob dashboard → the wallet integration → transaction processed callback | `<FUNCTIONS_BASE_URL>/payments-webhook` |

Both then go through the same HMAC verification and the same
`record_payment_event`. There is no second path and no unsigned one.

The redirect the customer's browser follows (`redirection_url`) is UX. It is
never proof of anything and nothing reads payment state from it.

`payments-reconcile` takes the service-role key in its Authorization header
and has no user path. Deploy it only behind a scheduler (or call it from one),
never as a public route:

```bash
supabase functions deploy payments-reconcile --no-verify-jwt
```

It asks Paymob about attempts that have been abnormal for more than fifteen
minutes and applies the answer through `record_payment_event` — the same
function, the same duplicate guard, the same state rules. With no Paymob
credentials it reports how many attempts it WOULD have asked about and stops;
it never reports "all clear" it has not earned.

`payments-simulate` is NOT deployed. It refuses to run in a deployment unless
`ALLOW_PAYMENT_SIMULATOR=true`, and there is no reason for that to be true
anywhere a customer can reach.

## Payment

| function | who calls it | what authenticates it |
|---|---|---|
| `payments-begin` | the app | the customer's JWT |
| `payments-webhook` | Paymob | the HMAC-SHA512 signature |
| `payments-simulate` | the app, demo orders only | the customer's JWT, plus a demo-merchant order |
| `payments-reconcile` | a scheduler | the service-role key |

Secrets, none of which may ever appear in the app bundle or in
`EXPO_PUBLIC_*`:

```
PAYMOB_SECRET_KEY            # "Token <this>" on the Intention API
PAYMOB_PUBLIC_KEY            # safe client-side; goes in the checkout URL
PAYMOB_HMAC_SECRET           # verifies every callback
PAYMOB_CARD_INTEGRATION_ID
PAYMOB_WALLET_INTEGRATION_ID
PAYMOB_BASE_URL              # optional; defaults to https://accept.paymob.com
APP_BASE_URL                 # where the customer is sent back to
```

### What is stored from a callback

An allow-list — the provider ids, amounts, outcome flags, response codes,
masked pan and timestamps. NOT the billing block Paymob echoes back, not the
customer email or phone (the order already holds the delivery address, where
deleting an account removes it), and nothing token-shaped. See
`sanitiseCallback` in `_shared/paymob.ts`; the tests assert the exact key set
rather than the absence of particular fields, so a provider adding one does
not silently start being retained.

A partially configured environment throws at the first payment rather than
silently falling back: half a key is worse than none. With NO Paymob variables
at all, `payments-begin` still serves demo-merchant orders through the
simulator and refuses real ones with `payment_unavailable` — it never invents
a payment.

## Local

```bash
supabase functions serve --env-file supabase/functions/.env
```

`supabase/functions/.env` is git-ignored. It is the only place a real API key
should ever sit on a developer machine.

## Shared schema

`_shared/anthropic.ts` and both functions import the response contract from
`src/features/ai/schema.ts` — the same module the app validates against. One
Zod schema generates both the JSON Schema sent to the model and the validation
applied to its reply, so the constraint and the check cannot disagree.

## Behaviour under failure

Nothing here is load-bearing for the product. If the key is missing, the model
declines, the response fails validation twice, or the user is rate-limited, the
function returns a stable error code and the app answers from its local
catalogue instead. "What can I cook?" always gets an answer.
