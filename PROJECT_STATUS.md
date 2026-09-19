# Project Status

**Read this first.** Written so another session can continue without any of the
previous session's context.

| | |
|---|---|
| **Last updated** | 2026-09-19 |
| **Current phase** | **CORE JOURNEY UX — numerals, onboarding, ingredient picker, budget, pantry and shopping list landed.** Design system refreshed to cobalt/cream/near-black; Home, recipe results and recipe detail redesigned. See "UI/UX upgrade". Naming is ON HOLD at the founder's instruction — `REBRAND_STRATEGY.md` records three completed rounds and no chosen name. |
| **App name** | Akla (working name, being retired — naming on hold, see `REBRAND_STRATEGY.md`) |
| **Stack** | Expo SDK 57 · React Native 0.86 · React 19.2 · Expo Router 57 · TypeScript 6 (strict) · Supabase · TanStack Query 5 · Zod 4 · Anthropic (Claude) via Edge Functions |
| **Launch market** | Egypt · EGP · English and Arabic, both complete **including the food itself** (see "Localisation") |

---

## UI/UX upgrade

**Goal:** stop the product reading as an AI-generated demo and make it read as a
real Egyptian consumer app. Backend behaviour deliberately untouched.

### Phase 1 — what was actually wrong (measured, not asserted)

| # | Finding | Evidence |
|---|---|---|
| 1 | **Two different primary colours.** White on the old `paprika500` was **3.48:1** — below the 4.5:1 body minimum — so the palette carried a second, darker `primaryStrong` for anything with a label. The brand colour was never the colour of the most important control on screen. | `palette.ts`, `contrast.test.ts` |
| 2 | **Capsule shape language.** `radius.pill` (999) was the *most-used* radius in the app — 21 sites — across buttons, chips, badges, search fields and icon plates, alongside 51 `<Chip>` and 10 `<Badge>`. | grep |
| 3 | **Two decorative gradients.** The home hero pair (gradient card + translucent white icon circle + white text + 26pt radius + shadow — the single most reproduced generated-UI pattern) and the missing-photo placeholder. | `(tabs)/index.tsx`, `recipe-image.tsx` |
| 4 | **58% of the catalogue had no photograph.** 67 images for 161 recipes; the other 94 rendered as a colour gradient with a stock glyph floating in it. | `image-assets.generated.ts` |
| 5 | **Everything floated.** `elevation()` applied to 13 surfaces including buttons, list rows, skeletons and segmented controls. | grep |
| 6 | **The key number was unreadable.** "How much of this do I already have?" — the question the product exists to answer — was a `3/5` badge sitting on the photograph behind a black scrim put there to make it legible. | `recipe-card.tsx` |
| 7 | **No brand typeface at all.** No `expo-font`, no `useFonts`, no font file. The app renders in whatever the OS picks, Arabic included. | grep |
| 8 | Four `sparkles` icons; Ionicons across 30 files; `Card` exported and used **zero** times. | grep |

### Phase 2 — design system (done)

- **`palette.ts`** rewritten to cobalt `#3155FF` / warm cream `#FBF7F0` / near-black
  `#12100E`. White on cobalt is **5.42:1**, so there is one primary again and
  `primaryStrong` is now an alias kept only for call-site compatibility. Dark mode
  flips `textOnPrimary` to ink, because white on the lighter dark-mode cobalt
  measures 3.77:1 and fails. **Both schemes were verified against the existing
  contrast contract before the file was edited**, and `contrast.test.ts` passes.
- **`tokens.ts`** — radii collapsed to `0/4/8/12/16/20`; `pill` survives only for
  avatars and circular icon buttons. Type scale tightened with negative tracking
  on display/titles and positive tracking on `micro` for uppercase eyebrows.
- **`elevation()`** flattened hard: level 1 is now a whisper, and separation comes
  from a hairline border plus a background step.
- **Components** de-pilled and flattened: `button` (rectangular, no shadow, true
  brand colour), `chip` (8pt rectangle, keeps its border when selected),
  `badge` (4pt squared status tag), `card` (border-first, elevation 0 default),
  `segmented-control`, `states`, `skeleton`, `stepper`.
- **`recipe-image.tsx`** — the gradient-plus-glyph placeholder is now a **flat
  typographic tile**: three muted sand tones instead of a rotating hue, with the
  cuisine set in small caps. This is what 58% of the app looks like, so it
  mattered more than any single screen.

### Phase 3 — first screen milestone (done)

- **Home** — the two gradient hero cards are now flat, bordered, left-aligned
  action rows with a squared icon plate, and they carry **live state** ("12
  ingredients in your kitchen") instead of a second line of marketing copy. The
  search field is a rectangle, not a capsule. The greeting became a `micro`
  uppercase eyebrow over a `title1`, so the hierarchy is type rather than size.
- **Recipe results** — the card is flat and bordered; the photo scrim gradient is
  gone; and the match moved off the photograph into a **labelled row with a
  proportion bar** — the one encoding of "nearly there" vs "barely" that reads at
  scrolling speed, which a fraction cannot.
- **Recipe detail** — both fact strips bordered rather than floating; the
  have/need groups now carry their own counts; the remaining hero gradient is
  documented as a functional scrim protecting the back/share controls over
  arbitrary photography.

### Phase 3.5 — refinement (done)

#### Typography: Alexandria, verified rather than assumed

`@expo-google-fonts/alexandria` 0.4.2, **MIT AND OFL-1.1** — embeddable in a
commercial app with no runtime fetch and no in-app attribution. Everything below
was read out of the shipped `400Regular` TTF, not taken from the metadata:

| | |
|---|---|
| Arabic | 101 codepoints in U+0600–06FF, **all ten** Arabic-Indic digits, 73 Presentation-Forms-A, 89 Presentation-Forms-B |
| Shaping | GSUB **and** GPOS present, so contextual joining and mark positioning are real |
| Latin | full A–Z a–z |
| Weights | nine static instances 100–900 — **every weight the app uses is a real file** |

**Four weights are bundled, not nine** (400/600/700/800, ~700KB). Each unused
weight is ~275KB for nothing.

**Why each weight is its own `fontFamily`.** React Native does not select a
weight out of a family the way CSS does: with statically loaded fonts
`fontWeight` is ignored on Android and unreliable on iOS, so asking for weight
800 has to mean asking for the ExtraBold *file*. The six semantic roles map:

| role | weight | file |
|---|---|---|
| display | 800 | `Alexandria_800ExtraBold` |
| heading | 700 | `Alexandria_700Bold` |
| subheading | 600 | `Alexandria_600SemiBold` |
| body | 400 | `Alexandria_400Regular` |
| label | 600 | `Alexandria_600SemiBold` |
| caption | 400 | `Alexandria_400Regular` |

**Arabic vertical metrics, audited separately as asked.** Alexandria at 1000
units/em reports `typoAscender 968 / typoDescender −251` — a **1.219 em**
typographic box — but `winAscent 1166 / winDescent 566`, a **1.732 em** ink-safe
box. That gap *is* the Arabic problem: the typo box describes Latin, the win
pair describes how far ink actually travels once Arabic descenders and stacked
marks are involved. This is not theoretical here — the app's own `ar.ts` carries
**89 shadda, 28 fathatan, 4 damma, 1 kasratan** and 2759 descender-bearing
letters. Latin-tuned leading does not clip one line; it makes wrapped Arabic
lines collide, mark into descender.

Arabic therefore has its own ratio table. Body and below clear **1.70 em**, at
or near the ink-safe box, so wrapped Arabic body copy cannot overlap. Display
and headings use 1.45–1.50: a 34pt headline at 1.732 em would carry 59pt of
leading and stop reading as a headline. **That trade is the one place the table
is not absolutely guaranteed**, and it is deliberate. Latin tracking is dropped
entirely in Arabic, whose letters join — negative tracking degrades the joins.

A font that fails to decode is **not** fatal: the system face still renders every
string, and the scale keeps `fontWeight` set for exactly that case.

#### The missing-photo treatment, third attempt

Two previous versions were both wrong, in opposite directions, and both are
recorded in `recipe-fallback.tsx`: a colour gradient with a stock glyph (read as
"no content"), then a flat beige tile with the same glyph (a *tasteful* large
empty rectangle is still a large empty rectangle). The fix was to stop rendering
a better absence:

- **Field** — a cobalt- or accent-tinted palette surface. Never beige, because
  beige is what "no image" looks like.
- **Motif** — an eight-point star lattice drawn in SVG: the geometry running
  through Cairo tilework, mashrabiya and Mamluk doors. Drawn as a repeating
  pattern, not an icon dropped in the middle, so it has texture at any size and
  no centre of gravity competing with the card title.
- **Variation** — by cuisine, through tint: nine cuisines onto four palette
  families, which varies a feed without turning it into a swatch test.
- **Height** — a plate may be *shorter* than a photo. A photo earns 16:10 by
  being appetising; an equal height of pattern does not, and it pushed the
  recipe's own name toward the fold on 58% of the catalogue. Large cards pass
  `fallbackAspectRatio` and get a 24:7 band.

It is also unmistakably not a photograph, which was a stated requirement.

#### RTL: the real finding

**The app decides layout direction two ways at once, and they cancel out.**
`I18nManager.forceRTL()` makes React Native flip every `flexDirection: 'row'`
automatically; roughly ten call sites *also* hand-write
`isRTL ? 'row-reverse' : 'row'`. When only the second is active rows flip once
and are correct; when both are, they flip twice and land back in left-to-right —
in Arabic.

Which one you get **depends on how you arrived.** `I18nProvider`'s hydration
restores a stored language with `setLanguageState`, which never touches
`I18nManager`; only the interactive `setLanguage` calls `forceRTL`. So launching
already set to Arabic and switching to Arabic in-app produce different layouts
from identical state. The Arabic screenshot showed it plainly: the drawer button
and both action cards did not mirror, while the section header did.

`src/components/ui/direction.ts` asks the question that actually matters — *is
something already flipping rows for me?* — and flips only when nothing else
will. Call sites using it are correct **before and after** any fix to the
provider, which is what lets the provider be fixed separately without a flag
day. The three screens in scope now use it throughout, including the match
proportion bar (which must grow from the reading edge — a bar filling leftward
reads as depletion) and the fact-strip dividers (physical `borderLeft` would
hang off the strip's outer edge once the row reverses).

**Not mechanically mirrored, on purpose:** the back chevron glyph flips (it
means "backwards", which is direction-relative) while the play glyph on *Start
cooking* does not (it means "play", which is not).

**Still open, outside these three screens:** the hydration path should call
`forceRTL`, and the ~10 hand-written flip sites should move to the helper. Doing
that app-wide is a separate change and was explicitly out of scope here.

#### Owned icon language — proposal, nothing drawn yet

Measured usage, most-seen first: the **five tab bar glyphs** (home, compass,
file-tray, heart, person-circle) are on screen on every single screen, then
`restaurant-outline` (the recipe mark), `cart-outline`, `add`, `close`,
`time-outline`. Recommendation: commission **those ten only**, on a 24pt grid
with a 1.75pt stroke, square terminals, no rounded caps, one optical size, and
keep Ionicons for the long tail of settings and utility glyphs. The tab bar and
app icon are the brand's most-reproduced assets and are worth owning first;
everything else can wait and is not worth a bespoke set.

The four `sparkles` icons are gone from the primary flows as previously agreed.

### Phase 4 — core journey UX (in progress)

Landed in stable milestones, each committed on its own.

#### Numerals — one system, Western 0–9, both languages

The product spoke **two numeral systems at once**. `t()` does plain string
substitution, so interpolated counts arrived as Latin digits; anything through
`formatNumber` / `formatMoney` / `formatDate` went through `Intl` under `ar-EG`
and arrived Arabic-Indic; and **49 Arabic-Indic digits across 17 lines** had
been typed into `ar.ts` by hand. It was visible on the Arabic home screen —
placeholder `١٥٠`, pantry count `3`.

Fixed with the `-u-nu-latn` Unicode extension rather than dropping to `en-US`:
it pins the numbering system and leaves grouping, currency placement, date
order and month names Egyptian, and preserves `formatMoney`'s `startsWith('ar')`
check — which is what selects ج.م over EGP. A naive switch to `en-US` would
have silently anglicised the currency symbol too, and `numerals.test.ts`
asserts exactly that so the shortcut fails loudly later.

#### Onboarding — seven steps to three

The old flow was `name → household → diet → avoid → taste → basics → kitchen`,
and the **only required step was `name`** — the single most optional fact in the
product, gating the first recipe. What survives had to be unanswerable by
default:

| step | why it earns a screen |
|---|---|
| **language** | changes every subsequent string; asking later means asking in a language they may not read |
| **avoid** | allergies are a **safety rule**, not a preference, and cannot be inferred. Eating style rides along — it changes every result and costs one tap on an open step |
| **start** | not a question. The first useful screen, chosen by the user |

Everything cut kept its default **and** already had a Settings screen: name →
`settings/profile`, household/country → `settings/household`, dislikes →
`settings/preferences`, basics → `settings/basics`, appliances →
`settings/kitchen`. No preference field was deleted; it stopped being compulsory.

Finishing now lands on `/cook` or `/budget` directly. It used to detour through
`(auth)/welcome` — which the route gate **already shows before onboarding** —
so a guest was asked to make an account twice, with the second ask standing
between them and the first useful screen.

Smoke covers both requested cases: a **fresh install** (asserts it opens on
language and never asks for a name) and a **persisted user** (asserts a reload
re-asks nothing).

#### Photography backlog — `PHOTOGRAPHY_BACKLOG.md`

`npm run audit:photos` ranks the 94 unphotographed recipes by how often they
actually reach a screen, using the app's **own** staple sets
(`SUGGESTED_KITCHEN_BASICS`, `COMMON_STAPLE_SLUGS`, `UNIVERSAL_BASICS`) rather
than a list typed into the script — so the ranking reflects what the matching
engine really does. Signals: pantry reach, Home's 30-minute rail, ingredient
count, launch market, Discover collection membership. It reads photographed
slugs off `assets/recipes/` because the manifest is Metro `require` calls that
Node cannot import — and the directory is what the manifest is generated from,
so it cannot drift.

Top of the list is exactly what you would want it to be: koshari lentil rice
(100% staple reach), shorbet adas, foul with eggs, taameya.

#### Ingredient picker + Cook flow — Milestone 3

**Audit first.** What was already good and kept untouched: `searchIngredients`
is a nine-tier scorer (exact canonical → exact alias → prefix → token prefix →
substring → fuzzy) that reads `name`, `nameAr` **and** `aliases`, so **Arabic
search already worked**; fuzzy results are suppressed whenever a confident
match exists; and the picker never asked for a quantity. Matching semantics are
unchanged.

What was costing time, each fixed:

| Problem | Why it mattered |
|---|---|
| A selected ingredient was **removed from its own results list** | The row under your thumb vanished and the next one jumped into it. You could not see what you had done, or undo it where you did it. |
| Suggestions were **12 hardcoded English strings** in the component | Monolingual, and drifted from a 257-ingredient catalogue. |
| The **11-category taxonomy was unused** | Browsing 257 ingredients meant guessing a word to type. |
| **No zero-results state at all** | Typing something unknown rendered nothing — even though the engine has always accepted free text. |
| Everything was chips, including results | A long list became a reflowing wall of small targets. |
| Opening Cook **silently pre-filled the last search** | The screen depended on something you did days ago, with nothing saying so. |
| CTA was "Find meals" with a **`sparkles` icon** | Dressed a deterministic catalogue search up as magic. |

**Changes.** Results are rows with visible selected state and one-tap toggle;
the selected list is a single scrolling rail rather than a growing wall;
categories browse on demand (nothing expanded until one is opened); zero
results explains itself and offers "add anyway"; last time's ingredients are a
labelled group you tap rather than a silent pre-fill; servings moved into
Filters; the gap-budget control stays visible because it defines what "cook
with what I have" *means*; the CTA reads **"See meals with N ingredients"**.

**A data-model limitation worth recording.** The catalogue flags 47 ingredients
`isCommonStaple`, and the first version of the quick-add list took the first
eighteen. That flag **carries no ordering** and the catalogue is authored
alphabetically, so the list opened with *anise, baking powder, bay leaf,
caraway, cardamom, clove*. All genuinely common staples; none is what somebody
at a fridge taps first. `features/ingredients/common.ts` now ranks by **how
many catalogue recipes actually call for each ingredient**, which is a better
proxy for both "likely in the kitchen" and "will actually unlock results", and
excludes universal basics because the engine already assumes those.

**Basics semantics preserved:** `UNIVERSAL_BASICS` is still only the two the
product defines, user-configured basics stay user-controlled, and nothing
silently assumes a normal ingredient exists.

#### A real bug found while testing

The suite had been failing about **one run in six** since Phase 3.5, and it was
not flakiness. `DemoNotificationsRepository.state()` returned a **fresh seed on
every call** until something was written, and the seed's timestamps are
relative to `Date.now()` — so two reads a millisecond apart disagreed, the
feed's times shifted under the reader, and `markAllRead` re-seeded before
saving and re-stamped rows that were already read. Seeding now persists on
first read. Eight consecutive clean runs since.

#### Ingredient picker cleanup

Four small fixes before Budget. `Only what I have` truncated to `Only what I
h...` inside a three-up segmented control, so the modes are now **Exact /
Missing 1 / Missing 2** with one short hint for whichever is selected — a
clipped label is worse than a terse one, and semantics are unchanged. The
category rail clipped its last chip to `Pan…`; `paddingHorizontal` on a
horizontal contentContainer is applied inconsistently at the far edge across RN
and RN-web, so a trailing spacer **element** does the job the padding could not.
Commons show **10 instead of 18** — ranking untouched, this is purely how much
is shown before the user asks. And selected chips in the groups dropped from
solid to **soft**: an ingredient can appear in the rail, in Common and in an
open category at once, and three solid cobalt fills made the rail stop reading
as the summary.

#### Budget flow — Milestone 4

The whole of `RequestFilters` sat **open on the screen** under a "Narrow it
down" heading: six groups of chips between a person and a list of meals they
can afford, on a screen whose only job is to take a number. It is now behind
one action, matching Cook.

**Servings moved the other way — onto the screen.** That is deliberately the
opposite of what happened in Cook, and the reason is that a budget without a
head count is not a constraint the engine can use: 150 EGP means something
completely different for one person and for five, and every downstream price is
derived from it. In Cook servings is a filter with a good default; in Budget it
is the second half of the question.

The amount renders at **display size** (new `Input emphasis="display"`), quick
amounts dropped from **five to three**, the CTA reads **"See meals under 150
EGP"** and lost its `sparkles` icon.

**The price disclaimer left the setup screen.** It was a filled info panel
giving a caveat the same visual weight as the input it qualified. The honesty
is not dropped — it moved to where it is actionable: results already label
every figure "Estimated prices, not live store prices", mark each row with `~`,
and count the items they could not price. A caveat next to the price it
qualifies is read; a caveat two screens earlier is not. The smoke asserts both
halves — setup is *not* a disclaimer page, results *do* carry the caveat.

Validation is pinned by test: empty, zero, negative, below-floor and text are
all refused; decimals, grouping separators and **Arabic-Indic digits typed on
an Arabic keyboard** are all accepted. The app renders Western numerals
everywhere, but refusing ٠١٢٣ as *input* would be refusing the launch market's
own keyboard. Currency position (`150 ج.م`, suffixed in both languages) is
pinned too, because a tidy-up to a prefix would silently change every price in
the product.

#### Pantry — Milestone 5

**Adding was a form.** The "+" in the header opened a sheet asking for a
quantity, a unit and a date — for the sentence "I bought tomatoes". Quantity,
unit and expiry are all *optional* to every consumer of a pantry item, so
demanding them at the door was turning the fastest thought in the product into
data entry.

**One field now does both jobs.** Typing filters what you have *and* offers
catalogue matches you do not, as one-tap adds with nothing else required. The
editor sheet survives for the details, reached by tapping a row. The field is
also always present now — it was hidden on an empty pantry, so the one screen
that most needed a way in did not have one.

**Expiring soon was a caption** in the same weight as a category heading, so
"three things are about to go off" looked exactly like "dairy". It is now a
tinted bordered block with its own count and its own `Cook with these`, which
carries `expiring=1` so the cook flow starts from those items rather than the
whole pantry.

**`Cook from pantry` moved up from the bottom.** With thirty ingredients, the
action the pantry exists to enable was below all of them.

**Basics got a quiet route** to the existing Settings screen — they change every
match in the app so they need one, but they are not what someone opens the
pantry to do, and editing is not duplicated.

Semantics preserved and now pinned by test: five expiry states (expired,
expires-today, expiring-soon, fresh, **unknown** — an undated item is never
guessed to be fresh); an expired item is unusable but **not deleted**; and
`Cook with these` hands over a *copy of the names*, so editing the temporary
search cannot reach back into storage. The smoke proves the last one end to end
— it removes an ingredient from the search and asserts the pantry is unchanged.

#### Shopping list — Milestone 6

**Checked items used to stay in place** inside their category group, so a
half-done shop was a list where the next thing to find was somewhere among the
things already found. Unchecked items now come first, still ordered by category
because that *is* aisle order, and the done pile sinks to the bottom at reduced
opacity — receded, not hidden, so a mistaken tick can still be undone.

The estimated-total surface was still floating on a shadow; this screen was not
in the Phase 3.5 flattening pass. It is border-first now.

**`Ordering — coming soon` is untouched and still disabled**, and the estimated
total keeps its "some items have no estimate" note. Nothing implies a live or
guaranteed basket price.

**Saved was audited and deliberately left alone.** It already uses `RecipeCard`
with `showMatch={false}` — so it does not repeat the dense matching information
from Results — and it already has saved/viewed/cooked tabs, quick unsave, and
empty states with a "Discover recipes" CTA. The brief asked for no invented
folders or classifications; the honest audit result is that this screen needed
nothing.

### Not done yet (deliberately, in the stated order)

Phase 3 screens 1, 3, 6–9 (onboarding, ingredient picker, budget, pantry, saved,
profile); Phase 4 imagery beyond the fallback; Phase 5 UX polish. **The brand
typeface (finding 7) is the largest remaining visual gap** and is blocked on
licensing Alexandria's static weights, not on code.

---

## Build-out progress

The product is moving past MVP: a real catalogue, real filtering, accounts,
profiles, social features and community submissions. Phases run in order
because each depends on the one before it.

| Phase | What | State |
|---|---|---|
| A | 150+ structured recipes with an import/validation pipeline | **done** — 161 recipes |
| B | Recipe image architecture with provenance and licensing | **done** — manifest, resolver, validator, credits screen |
| C | `RecipeConstraints` with genuine hard filtering | **done** — one model, hard filters, honest relaxations |
| D | Database-backed recipe search | **done** — query plan, keyset paging, indexes |
| E–G | Auth hardening, profiles, storage uploads | **done** — guest choice, expiry, handles, avatars |
| H, P | Drawer navigation and information architecture | **done** — drawer wraps the tabs |
| I | Friends, requests, blocking | **done** — schema, RLS, screen |
| **HOTFIX** | **Core product correctness: matching, and real photographs** | **done** — see "The hotfix" |
| J | 1-to-1 messaging | **done** — schema, RLS, repositories, list + thread, keyset paging, failed-send retry |
| K | Recipe sharing and deep links | **done** — shared as a reference, share sheet, external URL |
| L–N | Community submissions, moderation, admin | **done** — schema, RLS, submit form, status, review queue |
| O | In-app notifications | **done** — schema, trigger-written rows, feed, badges |
| Q–U | Privacy, security, performance, preview, tests | **done** |
| **UX cleanup** | Drawer, friends, messaging, submission order, demo banner | **done** — see below |
| **Backend activation** | Documented and audited, not yet performed | **ready** — `BACKEND_SETUP.md` |

### Why A–I are marked done

Not from memory. Each row above is a phase whose code is committed on
`claude/expo-rn-setup-mom5gw`, whose tests are in the suite that runs on every
push, and whose screens the interaction smoke test drives. Where a phase is
partly credential-gated (E–G need a Supabase project) the built half is
complete and the inert half is named under "Credentials this needs".

The catalogue is 161 recipes. It was 153 until the dataset audit found the
protein spread too narrow; five seafood dishes and three more went in after
it.

---

## The hotfix

### Round two: the app was still overstating what you have

Reported after the first round landed. Different ingredient selections now
produced different results — but someone holding **rice and tomatoes** opened
Tomato Rice and was told they had **six of seven ingredients** and needed only
coriander. They had two of ten. Onions, garlic, stock cube, cumin, tomato paste
and oil were all ticked and labelled "Pantry staple · assumed".

**No line in that recipe is marked a staple.** The recipe data was innocent;
the app had simply decided the user had those things.

#### Four concepts, now kept apart

| | What it is | Who decides |
|---|---|---|
| **Pantry** | Rows with a quantity and a date | The user, item by item |
| **Your basics** | An always-have list, offered in onboarding and editable in settings | The user, on a screen they can see |
| **Universal** | **Water and salt. That is the whole list.** | Us, and only for these two |
| **Optional / garnish** | Excused from the missing count | The recipe, where it genuinely says so |

The test for the universal list is not "is this common?" — nearly everything in
a kitchen is common. It is: *would anyone ever fail to cook because they lacked
it, and would they want to be told?* Oil, onions, garlic, cumin, sugar, flour
and stock all fail that test, so none of them are assumed.

#### What changed

- **`isUniversalBasic` replaced `isAssumedOnHand`** and went from ~50
  ingredients to two.
- **`UserPreferences.alwaysAvailableIngredients`** — 18 suggestions, ticked by
  default on a new onboarding step and editable at `/settings/basics`. Saffron,
  cardamom and sumac are deliberately not offered: those are bought for a dish.
- **Pantry rows enforce their own rules.** Quantity zero is not "some", and an
  expired row is not available — "keep assuming I have this" means the row does
  not *need* a quantity or a date, not that they stop applying when set. That is
  why rice could show "Staple" and "3 days left" together and read as a
  contradiction; the date always won and nothing said so. The toggle is renamed
  and the row now states the precedence.
- **Every tick names its source** — in your pantry, from your basics, typed
  into this search, or assumed. Three of the four are decisions the user made.
- **`npm run recipes:audit`** prints every recipe-level `staple` flag with a
  verdict: implicit, configured, or **ORDINARY**. Twenty-two came back ORDINARY
  across 59 lines — saffron, curry powder, sumac, vanilla, nutmeg — each a
  required ingredient hidden from the missing count. Those flags are stripped
  and the audit now reports zero ORDINARY rows. That is the invariant: *if we
  excuse it, either everyone has it or you told us you do.*
- **The ranker was ignoring the basics.** `rankRecipes` builds its own
  availability index and was not given them, so ticking or unticking on the
  settings screen changed nothing on the results screen — the filter knew and
  the ranker did not. Same for the recipe detail screen. Both fixed, with a
  test that fails if any path forgets again.
- **Recipe Detail's "Order ingredients"** looked active and opened a sheet
  saying "coming soon". It now reads "Ordering — coming soon" and is disabled,
  matching the shopping list. The provider registry is untouched.

#### The dataset gap this exposed

With honest semantics a banana/oats/milk kitchen reached four recipes, because
the catalogue had almost nothing you can make from them. Three recipes fill the
hole rather than the threshold being lowered: **muhallabia** — a staple
Egyptian dessert missing from an Egypt-first catalogue — warm oats with banana,
and a banana milkshake. **161 recipes.**

#### Reverified through the built app

Driven by `npm run smoke:web`, which prints this table from the rendered
screens. Counts are the app's own "N ideas", not a node count.

| Inventory | Mode | Result | First results |
|---|---|---|---|
| rice, tomatoes — **basics ticked** | ≤2 missing | 17 | Tomato Rice, Okra in Tomato, Bulgur Pilaf, Koshari |
| rice, tomatoes — **nothing configured** | ≤2 missing | **6, and Tomato Rice is not among them** | Tomato & Mozzarella, Mango Coconut Rice, Lentils and Rice |
| chicken, rice, tomato | exact / ≤1 / ≤2 | 1 / 4 / 17 | Tomato Rice |
| eggs, white cheese, tomato | exact / ≤2 | 1 / 15 | Tomato & Feta Shakshuka |
| banana, oats, milk | exact / ≤2 | 1 / 5 | Warm Oats with Banana |

The first two rows are the fix. Same search, same ingredients; the only
difference is whether that cook told us they keep oil, onions, garlic, stock
and tomato paste. **Ticked, Tomato Rice is one coriander short and ranks
first. Unticked, it does not appear at all.**

Two things that look like discrepancies and are not. Adding chicken to rice
and tomatoes changes nothing at ≤2 because the one recipe it would add,
shish tawook, needs a **grill** and the default kitchen is stove-only. The
banana milkshake is missing from the banana/oats/milk row for the same reason
— it needs a blender.

---

### Round one: what was reported

Manual testing of the real, rendered app found the central feature broken:

- "I can make this now" returned **the same 2 recipes** whatever was selected.
- Relaxed mode returned **the same ~20 recipes** whatever was selected.
- Recipe cards had no photographs.

The `RecipeConstraints` work was real and its unit tests passed. They passed
because they tested the filter in isolation, and the fault was in what the
screen handed it.

### The root cause — three faults compounding

**1. The wrong staple flag.** `buildAvailabilityIndex` treated
`isCommonStaple` as "assume the user has this". That flag is a pantry-UI
convenience marking 47 cupboard items — including **rice, pasta, potatoes,
onions, red lentils, fava beans, flour and sugar**. With those assumed, three
recipes were cookable from a completely empty kitchen, so they matched every
search ever made. Fixed by `isAssumedOnHand`: a seasoning, a cooking medium, an
aromatic or a small keeping cupboard support may be assumed; anything that
forms the substance of a dish may not, and no perishable ever may.

**2. Relaxed mode applied no constraint at all.** `checkRecipe` consulted the
pantry only when `pantryMode === 'strict'`. `partial` skipped the check
entirely and returned the top twenty by rank — which is why it looked like a
fixed list. A mode named after a thing it does not do is not a relaxation of
it. Replaced by an explicit gap budget: `strict` is 0 missing, and the UI now
offers 0, 1 or 2 as three real answers.

**3. Nothing required a result to use what you had.** With a generous assumed
set, a recipe made entirely of assumed items satisfies every gap budget for
every input. `manakish-zaatar` was returned for all four test cases.
`mustUseSomethingAvailable` closes it: an ingredients-mode search must use at
least one thing the user actually named.

### Measured, before and after

| Kitchen | Exact before | Exact after | ≤2 missing before | ≤2 missing after |
|---|---|---|---|---|
| chicken, rice, tomato | 1 | 0 | 20 | 26 |
| eggs, white cheese, tomato | 4 | 1 (shakshuka) | 20 | 24 |
| banana, oats, milk | 4 (incl. **koshari**) | 0 | 20 | 6 |
| ground beef, pasta, tomato | 4 | 0 | 20 | 16 |

Before: every relaxed search returned the same twenty. After: four different
answers, and banana/oats/milk no longer suggests koshari.

### What was NOT the cause, checked rather than assumed

- **The URL round trip was intact.** Ingredients, pantry mode and exclusions
  all survive `encodeRequest` → `decodeRequest`.
- **Caching was not a contributor.** The cook path ranks in a `useMemo` over
  the catalogue, keyed on a request object that changes with the URL params.
  The cache key was hardened anyway (`constraintsFingerprint`, 22 fields), so
  two ingredient sets cannot share a cached response.
- **Pagination was half a contributor.** SQL filters before `LIMIT`, correctly.
  But the client-side safety filter runs after, so a page of 24 could lose 20
  and render 4 cards. A top-up effect now fetches further pages until the page
  is full or 300 rows have been examined.

### Five more faults, all found by driving the built app

None of these could have been found by a unit test, because each lived
between two components that were individually correct.

- **An expired pantry item could still be cooked with.** Opening Cook from the
  pantry seeded every item into the picker, and a picked ingredient is trusted
  absolutely — so the food-safety rule was defeated by our own screen. Cook now
  seeds only what is in date, and the engine keeps `available` and `expired`
  disjoint rather than allowing both at once.
- **A card said "2 missing" in an "allow one missing" list.** The filter and the
  match aggregate each decided what counted as needed and disagreed: the filter
  excluded optional lines, garnishes and pantry staples; the match excluded only
  optional ones. `isNeededLine` is the single definition now — nobody is unable
  to cook because they are out of parsley to scatter on top.
- **The "allow a missing ingredient" button was inert.** Relaxation is
  implemented twice — on the constraints to decide what to offer, on the request
  to carry it through the URL — and the request half set only
  `pantryMode: 'partial'`, leaving the budget at zero. `missingBudgetFor('partial', 0)`
  is zero, because `0 ?? 2` is zero. The empty state offered a way forward and
  produced the same empty state. Both halves widen by one now, and a test holds
  them together.
- **"Include recipes using none of your ingredients" is no longer offered.** It
  could not be honoured, and it should not be: it abandons the question the user
  asked, and it is the behaviour that caused the original bug.
- **Ordering did not say what it did.** Fewest gaps is now a hard primary key
  rather than one term among six, and how much of what the user NAMED a recipe
  uses is scored at all — it was not. Coverage asks the opposite question, and
  the two come apart: "ground beef, pasta, tomato" returned eight recipes with
  no beef, every one at 100% coverage, because pasta and tomato needs nothing
  else and a ragu needs six more things.
- **A test named "cook returns results" passed on zero results.** Renamed to
  say what it asserts.

### Where the photographs stand

`npm run images:fetch` acquires them from Wikimedia Commons under a strict
licence allowlist, and `.github/workflows/recipe-images.yml` runs it, because
this sandbox's egress proxy blocks every Wikimedia host. Five runs were needed
and each failed differently — the workflow log is the only diagnostic
available, which is why every failure now carries its HTTP status and the
server's own explanation:

1. **0 of 158.** Asked for a 1200px render of every file including 900px ones;
   MediaWiki does not upscale, it answers 404.
2. **2 of 6, one of them wrong.** Scoring candidates by shared words gave aloo
   gobi a photograph of beef bourguignon — every word it scored on was really
   there. Replaced by three ranked sources (the dish's Wikipedia article, the
   Commons category, then a phrase match) and by searching the **slug**, which
   is the dish's name, rather than the title, which is an English gloss.
3. **45 of 158, all full-size originals** totalling 21.5MB. Commons appends
   `?utm_source=…` to the file URL, which ended up inside the thumbnail path,
   so every thumbnail 404'd and the original-file fallback caught it silently.
4. **72 of 158, correctly sized.** `Special:FilePath?width=` — MediaWiki's own
   documented way to ask for a file at a size — replaced the hand-built CDN
   path, which had been returning HTTP 400 for every request.
5. **67 of 161, after three rounds of someone looking at them.**

### The part no rule could do

The seventy-two were put side by side as contact sheets and examined. Eleven
had to go, and not one of them was catchable by a rule that reads a filename:

- The burger hero was a good photograph of a burger **standing beside a glass
  of beer, with bacon in it**. On a catalogue built for Egypt that is
  disqualifying twice over.
- `Menemen.jpg` was an **aerial view of the Turkish town** the dish is named
  after — correctly categorised, entirely wrong.
- A **grape vine in a garden** for warak enab. A heap of **branded dry muesli**
  for overnight oats. **Breaded fried oysters** for soft scrambled eggs. A pan
  of **raw mushrooms with cured meat** for risotto. A pale pancake for kunafa.
- Two photographs were each doing duty for two recipes.
- Later rounds added: a **branded fast-food shake cup** for the banana
  milkshake, and — three separate attempts for **Menemen** — an aerial view of
  the Turkish town, a commuter train at Ulukent, and a punnet of strawberries.
  The dish shares its name with a district, so its Commons category is
  landscapes and produce. That recipe keeps the fallback for good.

Acquisition now runs **most-surfaced-first** — MENA cuisine, short ingredient
lists, easy — so a run that stops early has spent its requests on the dishes
that fill Home, Discover and the answer to "what can I cook".

`data/images/rejected.json` records **fifteen refusals with the reason each**; the
fetcher never chooses them again and `images:check` refuses a manifest
containing one, including one restored by hand. Duplicates are handled
separately, because those photographs are fine — no file may illustrate two
recipes, enforced in the fetcher across runs and in the validator across the
manifest.

**Coverage settled at 67 of 161 (42%), having been 72 before anyone looked, and that is the correct direction.** The brief
asks for relevance over coverage, and eleven pictures of the wrong thing are
worth less than none of them. The 94 recipes still on the branded fallback are
listed in `manifest.skipped` with a reason each; most are ordinary weeknight
cooking with descriptive names — "Tray-Baked Salmon and Vegetables", "Air Fryer
Spiced Chicken" — for which no openly-licensed photograph of that specific dish
exists.

**Reviewing the next batch:** build contact sheets and look at them. Nothing
else finds a beer in the background.

```bash
npm run images:fetch   # in CI only; the sandbox proxy blocks Wikimedia
# then, locally, montage the manifest into sheets of 24 and read them
```

---

## The preview-review round: a photo that would not attach

Three things came back from a manual pass over the deployed preview. One was a
real regression, two were correctness.

**"Add a photo" reported a failure before it opened anything.** `useImageUpload`
began with `if (!supabase || !user) throw new Error('uploads need an account')`,
so on any build with no Supabase project — which every preview build is — the
mutation threw before the picker was reached, and the screen presented that as
"Something went wrong". Nothing had gone wrong. There was nowhere to PUT a
file, which says nothing about whether somebody may CHOOSE one. Picking and
uploading are now separate steps: pick, validate against the same rules the
buckets enforce, then upload if there is a backend and otherwise hand back the
local URI marked `stored: false`. The submit screen shows the photo either way
and, without a backend, says it is on this device only. The production path
through `recipe-uploads` is untouched.

**A pantry row rendered "rice / g / 2 days left".** `formatQuantity(null, 'g')`
returned the bare unit label, so an item with a unit and no amount printed the
suffix on its own. It returns nothing now, and the row says "Quantity not set"
for a tracked item — but stays quiet for a staple, whose whole point is having
no amount.

**The chat composer opened at two lines.** A `multiline` TextInput is a
`<textarea>` on web, react-native-web takes its `rows` from `numberOfLines`,
nothing passed one, and the browser applied its default of 2. It now measures
its content between 44 and 132 points and scrolls inside itself past that, so
Send stays on screen: 70px → 47px empty.

**And one piece of copy that was not true.** The generic error body said "We
have logged it." The logger's production sink is a documented no-op pending a
crash reporter, so in production nothing was logged, and in development it
reached a console. It says "Something went wrong. Please try again." now, and
a photo that cannot be used gets a specific reason instead — the file type,
the 8MB limit, the 320px floor.

## Last known passing state

Verified on `claude/expo-rn-setup-mom5gw` (also the repository's default
branch):

| Check | Command | Result |
|---|---|---|
| Typecheck, app AND build scripts | `npm run typecheck` | **pass**, 0 errors. Do not substitute `npx tsc --noEmit`; it silently skips `scripts/` — see **CI** below |
| Lint | `npx eslint . --max-warnings=0` | **pass**, 0 errors, 0 warnings |
| Unit + component tests | `npm test` | **pass**, 812/812 across 57 suites, 2 projects |
| Database + RLS suite | `./scripts/db-test.sh` | **pass**, 290 assertions across nine files |
| Edge function types | `npm run fn:check` | **pass** |
| Edge function tests | `npm run fn:test` | **pass**, 5/5 |
| Catalogue / price / recipe / type drift | `ingredients:import --check`, `prices:import --check`, `recipes:import --check`, `db:types:check` | **pass** |
| Web production bundle | `npx expo export --platform web` | **pass** |
| Image manifest | `npm run images:check` | **pass**, 67 of 161; licence, attribution, header bytes, SHA-256, no reuse, none refused on review |
| Dataset spread + staple flags | `npm run recipes:audit` | reports only — 161 recipes, no pair over 0.9 Jaccard, **zero ORDINARY staple flags** |
| Whole-app browser walk | `npm run smoke:web` | **pass**, 228 interaction checks across every screen with no page errors, in DEMO MODE so the social screens have something in them. Includes the narrow-viewport pass and the DOM-nesting audit over 12 screens |
| Offset pagination | `npm run audit:pagination` | **pass**, 6 assertions |
| The published Pages build | `npm run smoke:web -- --base <url>` | **cannot be run from this sandbox** — `omarrakram.github.io` is blocked by the egress proxy, verified by probing it. The same commit, built with the same command and the same `EXPO_WEB_BASE_URL`, is driven locally instead |
| Native production build | `eas build` | **not run** — needs an EAS project id |

### The test suite runs on two platforms

`npm test` runs two Jest projects. `native` is the component suite as before.
`web` runs `*.web.test.tsx` under `jest-expo/web`, where `.web.tsx` wins module
resolution exactly as it does in Metro.

That project exists because of a real crash: a `.web.tsx` file re-exported from
`'./date-field'`, which on web resolves back to **itself**. TypeScript and the
native Jest project both resolve that specifier to the `.tsx` sibling, so
neither could see it. Only a web-platform resolver can.

### Running the database suite in this sandbox

No Postgres runs by default. Start one as the `postgres` user (initdb refuses
to run as root):

```bash
export PATH=/usr/lib/postgresql/16/bin:$PATH
useradd -m postgres 2>/dev/null; mkdir -p /tmp/pgdata; chown postgres /tmp/pgdata
su postgres -c "PATH=$PATH initdb -D /tmp/pgdata -U postgres -A trust"
su postgres -c "PATH=$PATH pg_ctl -D /tmp/pgdata -o '-k /tmp -p 55432 -c listen_addresses=127.0.0.1' -l /tmp/pg.log start"
PGHOST=/tmp PGPORT=55432 PGUSER=postgres ./scripts/db-test.sh
```

### Environment notes (Claude Code Web)

- `api.expo.dev` and `docs.expo.dev` are blocked. **Prefix Expo CLI commands
  with `EXPO_OFFLINE=1`** — it resolves versions from
  `node_modules/expo/bundledNativeModules.json` instead.
- `images.unsplash.com` and `deno.land` are blocked. Deno is installed from npm
  (`deno@2.9.6`) instead, and `--min-dep-age 0` is required because the sandbox
  pins a minimum dependency age.
- **Docker is unavailable**, so `supabase gen types` cannot run here. CI runs it
  instead — see "Database types" below.

---

## End-to-end verification

`npm run smoke:web` exports the web bundle, serves it, and drives a headless
browser through what a person actually does — not just what routes exist. 53
assertions cover onboarding, the pantry add/edit/delete flow from **both**
entry points and its staple rules, ingredient selection and removal, the Saved
tabs, opening and clearing filters, saving a shopping-list item, opening the
drawer and navigating from it, switching language and reading the rendered
Arabic back, and a deep link surviving a reload.

It needs a browser driver, deliberately not a dependency of the app:

```bash
npm i -D playwright-core && npx playwright install chromium
npm run smoke:web
```

`CHROMIUM_PATH` and `PLAYWRIGHT_CORE` override discovery when a browser already
exists (which is how it runs in this sandbox).

**It has caught nine bugs no unit test would have.** Most recently: a drawer
`drawerPosition` that double-flipped under RTL and pushed every screen off the
viewport in Arabic, the pantry add sheet crashing into the error boundary, and
`Alert.alert` silently doing nothing on web so every confirmation in the app
was dead.

It used to only visit routes, and reported green while tapping "+" on the
Pantry crashed. Visiting a route proves the route renders and nothing more, so
every check here now asserts on the *result* of an interaction. Two further
notes for whoever runs it next — React Native Web's `TextInput` ignores
Playwright's `fill()` (use `pressSequentially`), and blocked remote image
requests are the sandbox's egress policy, not the app.

---

## What is built

### Screens

**Food.** Bottom tabs (Home, Discover, Pantry, Saved, Profile);
cook-with-what-I-have and eat-within-my-budget flows with a shared sortable
results view; recipe detail with have/need split, serving scaling and step
check-off; distraction-free cooking mode; natural-language search; shopping
list; **six-step** onboarding; eight settings screens; auth screens.

**People.** Edit-profile (`/settings/profile`); another user's public profile
(`/u/[username]`); friends, requests and blocking (`/friends`); the
conversation list (`/messages`) and a thread (`/messages/[id]`); the
notification feed (`/notifications`).

**Community.** Submit a recipe (`/submit`); what happened to the ones you sent
(`/submit/status`); the review queue (`/moderate`) and one submission under
review (`/moderate/[id]`).

Everything past the tabs is reached through the drawer, which carries unread
badges for messages and notifications and shows the review queue only when the
server says the viewer holds the role.

### Domain engines — pure, offline, unit-tested
| Module | Responsibility |
|---|---|
| `ingredients/normalise.ts` | Arabic-aware canonicalisation, prompt sanitisation |
| `ingredients/matching.ts` | Alias resolution, availability index, match percentage |
| `ingredients/freshness.ts` | Expiry buckets; expired items never counted |
| `pricing/units.ts` | Unit conversion, serving scaling, kitchen fractions |
| `pricing/price-book.ts` | `PriceBook` interface, country support, staleness |
| `pricing/estimate.ts` | Deterministic costing, completeness, budget verdicts |
| `recipes/constraints.ts` | The one constraint model every surface builds |
| `recipes/filter.ts` | Hard filtering only. Removes; never scores |
| `recipes/safety.ts` | Allergen, diet and appliance predicates, derived from the catalogue |
| `recipes/rank.ts` | Ranking on the survivors. Cannot resurrect anything |
| `recipes/query.ts` | Constraints → query plan, keyset paging |
| `profile/handle.ts` | Handle folding and validation, mirroring the DB constraints |
| `storage/images.ts` | Upload rules, resize targets, generated object paths |
| `search/interpret.ts` | Deterministic constraint extraction, incl. exclusions |
| `grocery/` | `GroceryProvider` adapter + registry + mock |
| `ai/schema.ts` | The model contract; generates its own JSON Schema |

### Data, and where it lives
Everything a person edits is a data file, not code:

| Data | Source | Generated into | Command |
|---|---|---|---|
| Ingredients (257) | `data/ingredients/catalogue.csv` | `catalogue.generated.ts` | `npm run ingredients:import` |
| Prices (69) | `data/prices/eg.csv` | `pricing/price-data.ts` | `npm run prices:import` |
| Recipes (161) | `data/recipes/*.json` | `recipes/catalogue.generated.ts` | `npm run recipes:import` |
| Database seed | the three above | `supabase/seed.sql` | `npm run seed:generate` |

Each importer validates and refuses bad input, and CI fails on drift. **257
ingredients recognised, 69 priced** — recognition and pricing are deliberately
separate concerns, and an unpriced ingredient is a supported state.

### Release
`eas.json`, `EAS.md`, CI (typecheck, lint, tests, Deno check + tests, four
drift checks, bundle, database suite, database-type drift), a GitHub Pages
preview workflow, and `SECURITY_REVIEW.md`.

The database suite is four files now — `01_rls_test.sql`, `02_query_test.sql`,
`03_profile_privacy_test.sql`, `04_storage_test.sql` — and `db-test.sh` runs
every `supabase/tests/0[1-9]*.sql` in order, so adding a fifth needs no script
change. `00_platform_shim.sql` recreates the `auth` AND `storage` schemas so
the policies can be exercised against a plain Postgres in CI; it is never
applied to a real Supabase project.

---

## Preview status

**Live at https://omarrakram.github.io/Food-App/** — open it on a phone, no
install, no account, no key.

`.github/workflows/preview.yml` builds and deploys on every push to
`claude/expo-rn-setup-mom5gw` (markdown-only changes excluded). Pages is
enabled and deploying; nothing manual is needed again unless the repository's
Pages source is changed.

Deep links and refresh work because the export is built for the subpath it is
served from (`EXPO_WEB_BASE_URL` → `experiments.baseUrl`) and Expo's static
output writes one HTML file per route. `404.html` is a copy of `index.html`, so
a stale bookmark reaches the app rather than GitHub's error page. Nothing
rewrites the URL at runtime — doing so breaks React Navigation.

The workflow refuses to publish if the bundle contains a secret-shaped string;
no secrets are provided to it, and the app falls back to its bundled catalogue
without a backend.

The earlier Claude Artifact is not a substitute: artifacts are private, so a
phone browser that is not signed in to claude.ai gets a 404.

### What the preview can and cannot show

Everything that runs on device works for real: the whole 161-recipe catalogue,
hard constraint filtering, all three gap budgets, budget estimation, Discover,
the pantry, Saved, the shopping list, the drawer, and both languages.

**The social screens run in DEMO MODE, and every one of them says so.** The
preview has no Supabase project behind it, so Friends, Messages, sharing,
submissions, moderation and notifications would otherwise be permanently empty
and nobody could review them. They are fed by seeded on-device repositories
instead — real behaviour, real persistence, real state machines — and each
carries a banner in the warning colour reading *"DEMO MODE — nothing here is
sent anywhere"*.

The rule that banner exists to keep: **a demo action must never be mistakable
for a successful server action.** The buttons have to do something for the
screens to be walkable, so what makes it honest is the label, not the
inertness.

Two things to know about it:

- `EXPO_PUBLIC_DEMO_MODE` is the only way in, and `env.ts` forces it false when
  `EXPO_PUBLIC_APP_ENV` is `production`. It cannot ship by accident.
- The moderator screens are reachable in the preview behind a flag, and the
  queue carries a second notice saying exactly that: in the real app that
  screen is reached only by an account a database administrator granted the
  role to, and there is no way to grant it from inside the app.

Everything else that needs a server is inert and **says so** rather than
pretending: sign-in, profiles and handles, avatar upload, and AI generation.
`/settings/about` reports which of those are live, reading what `env` actually
resolved.

### Verifying the deployed build from this sandbox

`omarrakram.github.io` is blocked by the egress proxy here, so the live page
cannot be fetched from a session. What CAN be verified, and is:

```bash
EXPO_OFFLINE=1 EXPO_WEB_BASE_URL=/Food-App npx expo export --platform web
cp dist/index.html dist/404.html
# serve dist/ under /Food-App/ on some port, then:
npm run smoke:web -- --base http://127.0.0.1:8099/Food-App
```

That is the same build the workflow publishes, under the same subpath, driven
by the same 93 assertions — which covers the things that actually differ
between a local run and a deployment: the base path, the per-route HTML, the
404 fallback, and assets resolving under a subpath. Whether GitHub is serving
it is then a question for the deployment API:

```bash
curl -s .../deployments?environment=github-pages\&per_page=1   # newest sha
curl -s .../deployments/<id>/statuses                          # state: success
```

## Where this session stopped

**Latest commit: see `git log -1` on `claude/expo-rn-setup-mom5gw`.** Phases A
through O are complete and verified, along with the correctness hotfix. Q–U
(the review pass) is most of the way through: the privacy audit, the security
review, the storage policy review, the pagination review, the accessibility
and RTL regressions, the secret scan and CI are all done. What remains is the
final deployed-preview walk, which this sandbox cannot do directly — the
egress proxy blocks `omarrakram.github.io`, verified by probing it.

### THE SINGLE NEXT ACTION

**Create a Supabase project and follow `BACKEND_SETUP.md`.** Everything else is
built, tested and deployed. That document is the whole activation sequence,
verified against this repository rather than written from memory: the 21
migrations apply to an empty database in filename order, a clean migrate-then-
seed produces exactly 161 recipes / 257 ingredients / 69 price estimates, and
the redirect paths in it are the constants the app's own deep-link parser reads
back.

Two things the audit found while writing it, both fixed:

- **Nothing exchanged the auth code on native.** The app built
  `emailRedirectTo` deep links and no listener existed, so on web Supabase
  parsed the callback itself and on native a tapped confirmation link opened
  the app and produced no session. It could not be noticed without a backend —
  with no project configured, no email is ever sent — and would have been the
  first thing to fail after activation. `src/features/auth/deep-link.ts` plus
  11 assertions.
- **Demo mode and a real backend could coexist.** `env.demoMode` was gated on
  the flag and the environment, but not on the absence of credentials — so a
  stale `EXPO_PUBLIC_DEMO_MODE=true` in a `.env.local` would have seeded a fake
  friend list beside a real one. It now turns itself off the moment Supabase is
  configured, asserted over every combination of the three inputs.

### The UX cleanup pass

- **Drawer.** The identity block showed "Your username, name and how visible
  you are" when there was no handle — instructional copy about a settings
  screen, truncating mid-word where a name belongs. It is avatar / name /
  handle / bio now, and tapping it opens the PUBLIC profile rather than the
  editor. The gear row is **Settings**; "Edit profile" stays distinct.
- **Moderator visibility.** Unchanged in behaviour and now pinned by a rendered
  navigation test: an ordinary user does not see the review queue, somebody the
  server says holds the role does. Verified to fail when the gate is removed.
- **Friends.** Message is the one inline action. Unfriend and Block moved
  behind •••, where a mis-tap costs a sheet rather than a friendship. "Friends
  since" left the row — at 320px it truncated to "Friends since A..." — and
  moved to the public profile, where the line has room.
- **Messaging.** Shared recipe cards were already tappable; the gone state is
  deliberate now ("Recipe unavailable", dashed border, not pressable) and
  tested both ways. Still a reference, never a copy.
- **Submission form.** Reordered to the authoring sequence — title,
  description, photograph, ingredients, steps, then the details you can only
  answer about a recipe that already exists. Four JSX blocks moved; the schema
  did not change.
- **Demo banner.** One line instead of a four-line card repeated on eight
  screens, expandable to the full text. Eight identical paragraphs is how a
  warning becomes wallpaper. The compact form still names DEMO MODE and states
  the consequence without being opened, and a screen reader hears the whole
  warning either way. The stronger moderator-role preview notice on the review
  queue is untouched.
- **Photography.** Unchanged standards, better ordering: the acquisition run
  now also prioritises recipes that appear in a Discover collection, alongside
  MENA cuisine and short ingredient lists. 67 of 161; the next ten it would try
  are Egyptian and Levantine staples.

#### What landed in J–O#### What landed in J–O

- **J — messaging.** `src/features/messages/` (interface, local, demo,
  Supabase), `src/app/messages/index.tsx` and `[id].tsx`, keyset paging on
  `created_at|id`, an optimistic send whose FAILURES STAY ON SCREEN (the outbox
  is local state, deliberately, so a refetch cannot swallow a failed message).
- **K — sharing.** `RecipeShareSheet` on the recipe screen; in-app sharing
  attaches `shared_recipe_id` and the card looks the recipe up, so an
  unpublished recipe stops rendering. External sharing builds a URL from
  `EXPO_PUBLIC_WEB_ORIGIN` — `akla://` alone is useless to anyone without the
  app. One migration came out of building it
  (`20260914090000_message_share_without_words.sql`): a share with no covering
  note was impossible to express, and the app would have had to invent a body.
- **L–N — submissions and moderation.**
  `20260914100000_community_submissions.sql`. Publication is a function, never
  a column write; `user_roles` has read policies and NO write policy at all, so
  a grant is a service-role operation and nothing else. Screens: `/submit`,
  `/submit/status`, `/moderate`, `/moderate/[id]`.
- **O — notifications.** `20260914110000_notifications.sql`. Rows are written
  by triggers on the tables where events happen; the table has no insert policy,
  so no client can put anything in anybody's feed — including its own. A
  notification is a POINTER (kind + subject id), never a copy.

#### Where the photographs stand

Not a task, a standing practice: another acquisition round would add a handful,
and every round needs a human to look at contact sheets before it ships.
`.github/workflows/recipe-images.yml` (manual dispatch, no inputs = every
recipe) is the only place it can run — this sandbox's proxy blocks
`commons.wikimedia.org` and `upload.wikimedia.org`, verified by probing them,
so the workflow log is the whole diagnostic. After a run: `git pull` (the
workflow commits and validates for itself), check the mean asset weight is well
under the 900KB cap, re-deploy, and confirm photographs render on the deployed
preview. Recipes with no sufficiently relevant openly-licensed image keep the
branded fallback and are listed in `manifest.skipped` with a reason — attaching
a photograph of a different dish tells the user something false about what they
are cooking.

### What is NOT done, and is deliberately waiting

- **Roles are granted out of band, and that is the design.** `user_roles` has
  read policies and no write policy at all, so the only way to make somebody a
  moderator is a service-role insert (or a human with database access). A
  policy that let admins grant admin would let anyone who reached one admin
  reach all of them. The drawer's `Review queue` row appears only when the
  SERVER says the viewer holds the role — and that row is a courtesy, not a
  control: `moderate_submission` re-checks with the caller's own credentials.
- **Push notifications.** The in-app feed is complete; push needs APNs/FCM
  credentials and a native build, so it is credential-gated rather than
  unbuilt. Nothing in the schema has to change to add it — a worker reads
  `notifications` and sends.
- **Realtime.** The messaging data layer is shaped for it (repository methods,
  query keys, invalidation) but no subscription is open: without a Supabase
  project there is nothing to subscribe to. The RLS policies already apply to
  Realtime, so a non-member would receive nothing.
- **Blocking and `friends` visibility are done.** The `public_profiles` view
  resolves `friends` through `are_friends()` now, and excludes anyone either
  party has blocked. `blocked_profiles()` is the narrow exception that keeps
  the block list readable by its owner.
- **Recipe photographs for every recipe.** The pipeline is complete and the
  acquisition runs; what will not happen is 100% coverage. Many recipes here
  are ordinary weeknight cooking with descriptive names — "Tray-Baked Salmon
  and Vegetables", "Air Fryer Spiced Chicken" — and no openly-licensed
  photograph of that specific dish exists. Those keep the branded fallback and
  are named in `manifest.skipped`. `RecipeImage` is the single seam.
- **Avatars in the preview.** `EXPO_PUBLIC_DEMO_MODE` exists in `env.ts` but no
  seeded demo users use it yet; that is Phase T.

### Credentials this needs and does not have

Nothing built so far is blocked, but three things are inert without config:

| What | Needs | Behaviour without it |
|---|---|---|
| Accounts, profiles, handles, uploads | A Supabase project (`EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`) | `isEnabled` is false; the app runs fully on local data and the UI says so rather than pretending |
| AI recipe generation | `ANTHROPIC_API_KEY` on the edge functions | Local catalogue answers every screen |
| Recipe image CDN | `EXPO_PUBLIC_RECIPE_IMAGE_BASE_URL`, or the Supabase Storage host | `resolveRecipeImageUrl` returns null and the branded fallback renders |

### CI

Green as of the last push (`855230f`, run 68: all three jobs).

**This trap has now caught the same mistake twice.** The typecheck step runs
`tsc --noEmit && tsc --noEmit -p scripts/tsconfig.json`, and every later step
in the job is *skipped* when it fails — so a red `app` job can hide the state
of eleven other gates. Two earlier commits (`c9a3063`, `d7b0fed`) failed on
`scripts/import-recipes.ts(466,48)`, fixed in `a22d001`. Then `3b26923` added
`scripts/audit-photography.ts` with four `string | null` errors and CI stayed
red for four consecutive commits (runs 64–67), because verification was done
with a bare `npx tsc --noEmit` — which checks the app project only, since the
root config *excludes* `scripts/`. Fixed in `855230f`.

**Run `npm run typecheck`, never `npx tsc --noEmit`.** The second is not a
faster version of the first; it is a different, smaller check.

Worth knowing when reading a red run: `smoke` and `database` are separate jobs
and do not depend on `app`. Through all four red runs they passed, so the
failure was only ever the type of a report-generating script — but you cannot
tell that from the run's red tick, only from the job list.

### Things left undone on purpose

- **Cook and Budget rank the whole catalogue** rather than paging. Their
  requests barely narrow anything and the ordering is the product, so
  `useMealSuggestions` defaults to `source: 'catalogue'`. Revisit past a few
  thousand recipes.
- **`results.relaxCollection`** is wired through `RELAXATION_LABEL` but no
  screen reaches it: Discover recovers from an empty collection with its own
  "Clear filters" action. The label exists because the reason has to exhaust a
  `Record<RejectionReason, …>` and mapping it to `null` would mean "safety,
  never offered", which is untrue of a collection tag.
- **`npm run format:check` fails on 88 files** and did before this work began.
  It is not in CI.

---

## Remaining work

### Credential-gated (nothing to build until these exist)
1. **Supabase project** — accounts, sync and edge functions are inert without
   it. The app runs fully on local data meanwhile.
2. **`ANTHROPIC_API_KEY`** — generation is inert; local catalogue results still
   answer every screen.
3. **EAS project id** — `npx eas init`, then native builds work.
4. **Apple / Google developer accounts** — store submission.
5. **Grocery provider agreements** — commercial, not technical.

### Buildable now
| Item | Notes |
|---|---|
| Recipe photography | `RecipeImage` is the single seam; set `imageUrl` and every screen picks it up. Until then a designed branded fallback is used |
| Price survey refresh | Edit `data/prices/eg.csv`, run `npm run prices:import -- --date=YYYY-MM-DD` |
| Designed app icon | Current mark is generated by `scripts/generate-icons.py` |
| Integration tests against a local Supabase | Sign-up → onboarding → pantry → suggestions; guest→account migration |
| Apple / Google sign-in | Scaffolded; `socialAuthAvailability()` returns false without client ids |

---

## Known issues

| # | Issue | Impact |
|---|---|---|
| 1 | Price estimates are illustrative, surveyed 2026-08-01 | Always rendered as estimates, with a staleness warning past 180 days — but needs a real survey before launch |
| 2 | 188 of 257 ingredients have no price | By design. The UI says "Price estimate unavailable" rather than guessing |
| 3 | `database.types.ts` is hand-maintained | CI now diffs it against the real schema, so drift fails the build rather than surfacing at runtime |
| 4 | Recipe imagery is a branded placeholder | Deliberate: no hot-linking, no licence exposure. Needs owned assets |
| 5 | Edge functions are type-checked and unit-tested but never executed against Claude in CI | Needs an API key. Run `supabase functions serve` before trusting a change |
| 6 | AI-generated recipes render in English for an Arabic reader | Deliberate. The model answers in one language and we do not machine-translate a cooking step or a safety note behind the user's back. Asking the model for Arabic directly is the fix, and is a feature, not a bug fix |

No known crashes. No known data-loss paths. No open security findings.

Deep links under the GitHub Pages subpath are checked separately, by serving
`dist/` behind `/Food-App` exactly as Pages does: the root, a tab deep link, a
nested settings route, a reload of each, and an unknown path landing on the
`404.html` copy of `index.html` rather than a blank page.

### Fixed in this pass

| Was | Root cause | Fix |
|---|---|---|
| Pantry "+" crashed into the error boundary | `date-field.web.tsx` re-exported from `'./date-field'`, which on web resolves to **itself** — the re-export became a getter returning itself and the first call blew the stack | Helpers moved to `date-field.shared.ts`, which has no platform suffix and so cannot be resolved to a platform variant. Covered by a web-platform Jest project and by the smoke test |
| Every confirmation in the app did nothing on web | `Alert.alert` is a silent no-op in react-native-web — exiting cooking mode, signing out, deleting an account and clearing history were all dead | `src/lib/confirm.ts`: the platform dialog on native, `window.confirm` on web |
| Arabic UI rendered in English | Recipe content, ingredient names and units were data and code, not dictionary keys | See "Localisation" |
| Discover's zero-result state had no way out | The collection filter had no "everything" state to return to | An "Everything" chip, and a one-tap reset inside the empty state whenever a collection is active |
| Selected ingredients were easy to miss | A soft tint, a few pixels from rows of unselected pills that are also pill-shaped | Solid fill, a tick, and an explicit "remove {name}" accessibility label |
| An Arabic keyboard could not search | Every pattern in `interpretQuery` was `\d`, which is ASCII-only | Arabic-Indic digits normalised before parsing |

---

## Architectural decisions worth not re-litigating

1. **Local-first behind one interface per collection.** The app works fully
   signed out; sign-in is a migration, not a reset.
2. **The model never decides a fact software can compute.** Availability, match
   percentage, cost, allergen safety and expiry are deterministic code.
3. **`PriceTag` is the only price renderer**, and a price carries its own
   completeness. A total assembled from incomplete data can only grow, so
   "over budget" stays assertable and "within budget" does not.
4. **Money is an integer count of minor units.** Estimates render to whole
   units; live prices keep their piastres.
5. **Diet is two things.** An exclusive eating style, and flags (halal, keto)
   that coexist with it and each other.
6. **Allergens filter, never rank** — applied to the catalogue and again after
   AI generation, through the same code path.
7. **A perishable is never an assumed staple.** Enforced in the data, in the
   availability engine, and in the importer.
8. **RLS is the entire client-side security boundary**, so it is tested like
   one: 45 assertions including forged foreign keys and a coverage check.
9. **Recognition and pricing are separate data.** Adding a food must never
   require inventing a price for it.
10. **Recipe ids are deterministic UUIDv5**, so a recipe saved offline is the
    same row after sign-in.
11. **The budget reaches the model as a band, never an amount.**
12. **Deep links are a hosting concern.** The web build is configured for the
    path it is served from; nothing rewrites the URL at runtime, because doing
    so breaks React Navigation.
13. **A module with two platform implementations keeps its shared code in a
    third file with no platform suffix.** `'./x'` inside `x.web.tsx` resolves
    to itself on web; a suffix-free module cannot be resolved to a variant, so
    the ambiguity cannot come back. This cost the pantry add screen once.
14. **Ingredient names are stored in English and translated at render.**
    Matching, pricing and the shopping list all key off one spelling; a pantry
    written in Arabic must still match a recipe written in English.

---

## Localisation

**Key parity was never the finish line.** The dictionary hit 468/468 while the
rendered Arabic app still showed English everywhere it mattered: every recipe
title, description and cooking step; every ingredient name; every unit ("300 g",
"4 cloves"); the search examples; the expiry and protein filter chips; the
currency code. A rendered audit of every major screen found **158 lines of
Latin script**; it now finds one, and that one is deliberate.

Four layers, because the English came from four different places:

1. **UI copy** — `src/i18n/locales/{en,ar}.ts`. `ar` is typed as a total
   record, so a missing translation is a compile error, and seven runtime
   assertions cover what types cannot: empty values, stale keys, both halves of
   every plural, invented placeholders, and English left in place.
2. **Ingredient names** — `data/ingredients/catalogue.csv` carries `name_ar`
   for all 257 entries. Names are **stored** canonically in English so matching
   stays language-blind (an Arabic pantry must still match an English recipe);
   `features/ingredients/display.ts` is the only thing that turns one into what
   the user reads.
3. **Recipe content** — titles, descriptions, steps and safety notes have their
   own Arabic columns (`title_ar`, `description_ar`, `instruction_ar`,
   `safety_note_ar`) in the fixtures, the migrations and the seed.
   `features/recipes/localise.ts` chooses between them, and also holds the
   shared phrasebook for preparations ("finely chopped" → «مفروم ناعم»), which
   are repeated vocabulary rather than per-recipe prose.
4. **Units and money** — `unitLabel` and `formatQuantity` take the translator;
   `currencySymbol` renders ج.م rather than "EGP".

**Nullable on purpose.** An AI-generated recipe comes back in one language, and
machine-translating a cooking step — where "simmer" and "boil" are different
instructions, and a safety note is a safety note — is not something to do
silently. Null means "no Arabic yet" and the renderer falls back to English.

Three things stop this regressing:

- An **ESLint rule** (`no-restricted-syntax`, `src/**/*.tsx`) fails the build
  when a literal English string reaches a user-facing prop. Every leak above
  was invisible to the dictionary check because none of it was ever a key.
- `features/recipes/__tests__/localise.test.ts` asserts every curated recipe,
  step, safety note (**including its temperatures**), ingredient name and
  preparation phrase has Arabic.
- `npm run smoke:web` reads the rendered Arabic recipe, cook and pantry screens
  and fails on any Latin character.

**The one deliberate exception** is "English" on the language picker: a language
is named in its own language. It is listed in the parity test's
`intentionallyLatin` set along with the brand names and an email example.

Arabic is written for an Egyptian consumer rather than transliterated. The
`_one` plural forms deliberately omit `{count}`, because Arabic lexicalises the
singular («طبق واحد»). `interpretQuery` normalises Arabic-Indic digits before
parsing, so "أقل من ١٥٠ جنيه" is understood — before that every number pattern
was `\d`, which is ASCII-only, and an Arabic keyboard produced nothing.

### Direction: one mechanism, decided in one place

`src/i18n/direction.ts` owns every direction decision in the app, and its
header is the reference. The short version, because the two platforms behave
completely differently and each of them lies about it:

**Native.** RN mirrors the interface itself when the native flag is set: every
`flexDirection: 'row'` is reversed, and every `left`/`right` in a style is
swapped (`doLeftAndRightSwapInRTL`). `forceRTL()` writes that flag **for the
next launch**, and `I18nManager.isRTL` is a snapshot taken when the JS loaded —
so it never changes mid-session.

**Web.** `react-native-web`'s `I18nManager` is a **stub**: `forceRTL` is a
no-op, `getConstants().isRTL` is hard-coded `false`, and the object has no
`isRTL` property at all, so `I18nManager.isRTL` reads `undefined`. The web
build mirrors nothing on its own, ever.

So "is the platform mirroring for me?" is a real runtime question with three
answers, and the resolvers mirror in JS **exactly when the platform will not**.
That is correct in all four states — persisted Arabic, persisted English, a
switch to Arabic, a switch back — with no reload needed for anything the app
controls.

The two bugs this replaced:

- **The double-flip.** Twelve sites wrote `isRTL ? 'row-reverse' : 'row'` by
  hand while `forceRTL` was also in play. On native Arabic after a restart both
  applied, rows flipped twice and landed back in English layout — while reading
  Arabic. Alignment and border sides had the same fault for the same reason.
- **The permanent restart notice on web.** `directionPending` was
  `isRTL !== I18nManager.isRTL`, which on web compares a boolean against
  `undefined` and is therefore true in **both** languages. The shipped web
  build was telling every user to restart, in English included.

Three rules, all enforced by `src/i18n/__tests__/direction.test.tsx`:

1. **Never write `row-reverse` or a bare `left`/`right` in a style.** Use
   `useRowDirection`, `useSide` or `useTextAlign`.
2. **Icons are the exception and are named as one.** `useGlyph(ltr, rtl)`
   follows the language and ignores the platform, because no platform mirrors a
   glyph. Passing the same value twice is how a caller says "this one does not
   mirror" — a play triangle, a flask, a flame.
3. **Both paths that set a language call `applyPlatformDirection`** — the
   interactive switch and the hydration that restores a stored one. Those two
   diverging is what made layout depend on how you arrived.

The Language screen still offers a restart, now only where one is genuinely
pending: on native, for the parts JS cannot mirror — the drawer's side, gesture
directions (expo-updates on native, a plain reload on web).

**Still split-brain, and next:** 77 plain `flexDirection: 'row'` sites mirror
automatically on native Arabic and not at all on web, because web has no
platform mechanism to do it. Closing that means giving web one — a document
direction — rather than converting 77 call sites. Tracked below.

---

## Renaming

Three places: `app.json` (`name`, `slug`, `scheme`, bundle identifiers), the
`common.appName` key in `src/i18n/locales/{en,ar}.ts`, and `name` in
`package.json`.

---

## Commands

```bash
npm install
cp .env.example .env.local          # optional — the app runs without it

EXPO_OFFLINE=1 npx expo start       # EXPO_OFFLINE only needed behind a proxy
npm run verify                      # typecheck + lint + test
npm run smoke:web                   # export + drive the app in a real browser
npm test -- --selectProjects web     # the web-platform Jest project on its own

npm run fn:check                    # type-check the edge functions (Deno)
npm run fn:test                     # run their tests

npm run ingredients:import          # data/ingredients/catalogue.csv -> TS
npm run prices:import               # data/prices/eg.csv -> TS
npm run seed:generate               # regenerate supabase/seed.sql
npm run audit:pagination            # refuse offset paging on growing lists
./scripts/db-test.sh                # migrations + seed + 290 RLS assertions

npm run db:types:from-url           # regenerate Supabase types (needs Docker)
python3 scripts/generate-icons.py   # regenerate the placeholder icons
```
