# Product Spec — Akla

*Working name. Trivially changeable: `app.json` (`name`, `slug`, `scheme`) and
the `common.appName` translation key.*

---

## The problem

People do not know what to eat. Not because recipes are scarce — because every
recipe site assumes you will shop for it. The real constraints are:

- what is already in the kitchen
- how much money there is this week
- how much time there is tonight
- what the body needs or the diet allows
- what the kitchen can actually cook with

Akla answers **"what should I eat?"** against those constraints, in that order.

## Launch market

Egypt. Default currency EGP, default country EG. Ingredient vocabulary,
price estimates and recipe set are Egypt-first. Architecture is
market-agnostic: country and currency are unions, price books are per-market,
and localisation is in place from the first commit.

## Success in five seconds

Opening the app shows a greeting, a question — *"What are you eating today?"* —
and two buttons:

1. **Cook with what I have**
2. **Eat within my budget**

If a new user understands the app from that screen alone, the home screen is
doing its job. Everything else is secondary navigation.

---

## Core flows

### 1. Cook with what I have

Add ingredients by typing (with autocomplete), tapping common ingredients, or
pulling from the pantry. Optional narrowing: servings, max cooking time, meal
type, cuisine, protein target, calorie ceiling. Then **Find meals**.

Results are multiple options, each showing how much of it the user already has.

*Future entry points — barcode, receipt scan, fridge photo, voice — are
additional sources feeding the same `string[]`; nothing downstream changes.*

### 2. Eat within my budget

Enter an amount (or tap a preset: 75 / 100 / 150 / 250 / 400 EGP). Optional
filters: servings, meal, cuisine, time, high-protein, healthy. Then
**Find meals**.

Results are ranked by how well they use the budget — not merely by being cheap.
A meal at 70–100% of budget outranks one at 20%.

**Every price is an estimate and is shown as one.** `~126 EGP · Estimated`,
never `126 EGP`. This is a hard product rule, enforced by routing all price
rendering through a single component.

### 3. Search

Natural language: *"something cheesy under 150 pounds"*, *"high protein meal
using chicken"*, *"dinner in 20 minutes"*, *"something Egyptian for four
people"*. The app parses constraints deterministically, shows the user what it
understood as chips, and searches on the structured form.

---

## Screens

### Home
Greeting, the question, search entry, the two primary actions, an
"expiring soon" nudge when the pantry has items near their date, and quick
ideas.

### Discover
Horizontal collection chips — Quick meals, Under 100 EGP, Under 200 EGP,
High protein, Healthy, Egyptian, Italian, Asian, Breakfast, Late night,
Air fryer, Beginner friendly, Trending — over a card feed.

### Pantry
Persistent virtual pantry. Add / remove / edit quantity / set expiry / mark
staples. Grouped by category (Protein, Vegetables, Fruit, Dairy, Carbs, Spices,
Sauces, Frozen, Bakery, Pantry, Other), with expired and expiring-soon surfaced
above everything else. One tap to cook from the whole pantry.

### Saved
Three tabs: Saved, Recently viewed, Cooked.

### Profile
Food preferences, household, kitchen, shopping list, appearance, language,
account, privacy.

### Recipe detail
Large photo. Title, description, prep/cook/difficulty, per-serving calories,
protein, carbs, fat. Estimated cost with per-serving breakdown. A servings
stepper that rescales every quantity. Ingredients split into **You already
have** and **You need**. Numbered steps with check-off and inline food-safety
notes. Actions: Start cooking, Save, Add missing to shopping list, Order
ingredients (explains it is not live yet).

### Cooking mode
One instruction at a time, large type, progress bar, previous/next, the
ingredients that step needs, the safety note for that step, screen kept awake.

### Shopping list
Grouped by category, ticked off in the shop, duplicates merged automatically
(2 tomatoes + 3 tomatoes = 5 tomatoes), estimated total clearly labelled as an
estimate.

### Onboarding
Progressive, one question per screen, everything after the name skippable:
name → country/city → household size → diet → allergies → dislikes → goal →
cuisines → skill → appliances → done. Draft is saved on every change; closing
the app mid-flow resumes where it stopped. All answers editable later.

---

## Non-negotiable rules

### Allergies are hard constraints
A declared allergen removes a recipe. It is never down-ranked, never
"probably fine in this quantity", never overridable by the model. Checked
against both the recipe's declared allergens and the allergens implied by its
ingredients, so a mis-tagged recipe is still caught. Generated recipes are
re-checked after generation.

### Expired food is never recommended
An item past the date the user entered is excluded from availability, and the
recipe detail says why. The app does not reason that one day over is fine.

### Food safety guidance is attached, not optional
Steps involving poultry, ground meat, seafood or eggs carry explicit
temperature and handling notes, shown both in the recipe and in cooking mode.

### Estimated is not live
See above. `PriceTag` is the only price renderer.

### Personalisation is opt-out and visible
Views, cooks and saves are recorded only while personalisation is on. The
switch is in Profile → Privacy, and history is clearable in one tap.

### No raw errors
Every failure resolves to a written state: offline, AI unavailable, database
unreachable, timeout, rate limited, no results, invalid input, expired session,
empty pantry, empty list.

---

## Out of scope for V1

Documented as future work, with the architecture already shaped for them:
supermarket ordering, live prices, price comparison, delivery, barcode/receipt/
photo capture, voice input, meal planning, macro tracking, fitness
integrations, shared households, social sharing, creator recipes, restaurant
recommendations, leftover management, expiry notifications, conversational
recipe modification.
