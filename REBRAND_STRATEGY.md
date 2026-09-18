# Rebrand Strategy

**Status:** proposal. Nothing in this document has been implemented.
**Naming status:** Round 1 (§4–§7) is **REJECTED** — all three finalists died in external
market checks. The live naming work is **§10, Naming Round 2**. Sections 1–3, 7.0, 8 and 9
(the audits, the shared colour/type/shape foundations, the sequence and the guardrails)
remain **approved and current**.
**Scope of this commit:** this file only. No application code, no design tokens, no
database objects, no copy, no configuration has been changed.
**Decision required from the founder:** the name. This document narrows to three
finalists and refuses to pick one, on purpose — see §6.

---

## 1. Audit: every reference to "Akla"

Counted across the working tree, excluding `node_modules`, `.git`, and the generated
`coverage/` HTML report (which is a build artefact and will regenerate under any name).

**77 files contain the string. They fall into five tiers, and the tiers matter far more
than the total, because they have wildly different costs to change.**

### Tier 1 — user-visible, 6 strings, ~1 hour

The entire visible surface of the name is six strings. This is the good news: the
product was built with a translation layer, so the brand name is data, not code.

| File | Key | Current value |
|---|---|---|
| `src/i18n/locales/en.ts:11` | `common.appName` | `Akla` |
| `src/i18n/locales/ar.ts:20` | `common.appName` | `أكلة` |
| `src/i18n/locales/en.ts:637` | `profile.signOutConfirm` | "Sign out of **Akla**?" |
| `src/i18n/locales/ar.ts:710` | `profile.signOutConfirm` | "تسجيل الخروج من **أكلة**؟" |
| `src/i18n/locales/en.ts:697` | onboarding body | "**Akla** turns what is already in your kitchen…" |
| `src/i18n/locales/en.ts:703` + `ar.ts:351` | `account.localBody` | "**Akla** works without an account…" |

Note the Arabic name is **أكلة** — literally "a dish / a meal". This is exactly the
generic food vocabulary the naming brief rules out, in the language of the first market.
Retiring it is correct.

### Tier 2 — store & platform identity, ~15 values, must change before any store submission

| File | Value | Notes |
|---|---|---|
| `app.json` | `name: "Akla"` | store display name |
| `app.json` | `slug: "akla"` | affects EAS project identity |
| `app.json` | `scheme: "akla"` | deep-link protocol, see Tier 3 |
| `app.json` | `ios.bundleIdentifier: "com.akla.app"` | **immutable after first App Store submission** |
| `app.json` | `android.package: "com.akla.app"` | **immutable after first Play Store submission** |
| `package.json` | `name: "akla"` | |
| `assets/images/` | 6 icon/splash PNGs | `icon.png`, `favicon.png`, `splash-icon.png`, 3 Android adaptive layers |

> **Hard deadline.** `bundleIdentifier` and `package` can never be changed once either
> store has accepted a build. They are the single most expensive thing in this document
> to get wrong, and they are currently wrong. Renaming must land before first submission.

> **Existing inconsistency found.** `app.json` sets the Android adaptive-icon background
> to `#FF6B35`, but the actual brand primary in `src/theme/palette.ts` is `#E85D2A`.
> The launcher icon has never matched the app. Nobody caught it because the two values
> live in different files with no check between them. The rebrand should introduce one.

### Tier 3 — deep links & storage keys, ~40 occurrences, **the only genuinely risky tier**

- **URL scheme `akla://`** — 23 occurrences across 8 files: `src/features/auth/deep-link.ts`,
  `src/features/sharing/links.ts`, both their test suites, `src/lib/config/env.ts`,
  `.github/workflows/preview.yml`, `BACKEND_SETUP.md` and `PROJECT_STATUS.md`. Changing it
  invalidates every previously shared recipe link and requires the Supabase Auth
  redirect allow-list to be updated **in the dashboard, in lockstep with the deploy**.
  Get this out of order and password reset and email confirmation break in production.
- **Local storage keys `akla.*`** — 21 distinct keys, 16 of them declared in one table in
  `src/lib/storage/index.ts`
  (`akla.local.pantry`, `akla.pref.language`, `akla.schema.version`, `akla.guest.profile`, …).
  These are already-written keys on real devices. Renaming the prefix **orphans every
  existing user's pantry, saved recipes and shopping list.**
  *Recommendation: do not rename them in the same release.* Either leave the prefix
  permanently (it is invisible to users) or ship a one-time migration that copies
  `akla.*` → `<new>.*` and only then clears the old keys. Storage already has a
  versioned migration path (`akla.schema.version` is at `'2'`), so the machinery exists.

### Tier 4 — internal, cosmetic, zero user impact

`AKLA_NAMESPACE` (UUID v5 seed in `scripts/uuid.mjs`), `AklaRecipeApp/1.0` (fetch
User-Agent in `scripts/fetch-recipe-images.ts`), `akla_test` (local test database),
the `[akla]` log prefix in `src/lib/logger.ts`, and ~14 TanStack Query cache-key roots.

> **Do not touch `AKLA_NAMESPACE`'s value.** It is the UUID v5 seed that deterministically
> derives every recipe *and ingredient* id, consumed by `scripts/import-recipes.ts`,
> `scripts/generate-seed.ts` and `scripts/assign-fixture-ids.mjs`, so that a recipe carries
> the same id offline in `catalogue.generated.ts` as it does in Postgres. Changing it
> silently re-IDs all 161 recipes and 257 ingredients and breaks every saved recipe, share
> link and foreign key in the live database. The file already says "NEVER change this
> value" — heed it. Rename the *constant* if you want the tidiness; never touch the string.

### Tier 5 — recipe data attribution, 161 records

`"creator": "Akla kitchen"` on all 161 recipes in `data/recipes/*.json`, carried into
`catalogue.generated.ts` and `supabase/seed.sql`. Regenerating is a scripted operation
(`npm run seed:generate`), but it rewrites seed data and should ride with a deliberate
data migration, not a UI release.

### Rename cost summary

| Tier | What | Files | Risk | When |
|---|---|---|---|---|
| 1 | Visible copy | 2 | none | any time |
| 2 | Store identity | 3 + assets | **irreversible after submission** | before first store build |
| 3 | Scheme + storage keys | ~12 | **breaks links / orphans data** | staged, with backend change |
| 4 | Internal strings | ~20 | none (except the UUID seed) | any time |
| 5 | Data attribution | 161 records | regeneration | with a data migration |

---

## 2. Audit: the current design system

### 2.1 Where it is genuinely good

The foundation is better than the surface. Worth saying plainly, because the rebrand
should keep it:

- **One token file.** `src/theme/tokens.ts` and `src/theme/palette.ts` hold every visual
  constant. Components read semantic roles (`surface`, `textSecondary`), never hex. A
  re-skin is a two-file change. This is why the visual rebrand is cheap.
- **Contrast is tested, not assumed.** `src/theme/__tests__/contrast.test.ts` computes
  WCAG ratios over both light and dark palettes and fails the build on a regression.
  Any new palette must clear it — §7 does, with the numbers shown.
- **Both schemes are real.** Light and dark are fully specified, not derived.
- **Arabic is structural.** Line heights are absolute rather than multipliers,
  specifically to give Arabic glyphs vertical room. RTL is handled throughout.

### 2.2 Color

Brand ramp: **paprika** (`#E85D2A` at 500) with basil green, saffron yellow, chili red
and sky blue as support. Backgrounds are warm cream (`#FFFBF7`), text near-black
(`#1A1614`).

**The structural flaw:** paprika500 is too light to carry white text. White on `#E85D2A`
is **3.48:1** — below the 4.5:1 body-text minimum. The palette works around this with a
second token, `primaryStrong` (`#C74A1E`, 4.74:1), used only for filled buttons. The
codebase documents the workaround honestly in a comment. So the app has **two primary
colors**: the one you see on icons and borders, and a different, darker one on every
button. That is a brand-recognition leak — the hero color is never the color of the
most important element on screen.

The proposed cobalt fixes this outright, and that is the strongest technical argument
for the switch: white on `#3155FF` is **5.42:1**. One primary. No split. `primaryStrong`
can be deleted.

### 2.3 Typography

**There is no brand typeface.** No `expo-font`, no `useFonts`, no `.ttf`/`.otf` anywhere
in the repository. The app renders in the OS default — San Francisco on iOS, Roboto on
Android, whatever the browser picks on web. Arabic falls back to the system Arabic face,
which differs on every platform.

This is the single largest brand-recognition gap in the product. Talabat and Breadfast
are recognizable in a screenshot partly *because of their letterforms*. This app is
currently recognizable as "a React Native app".

The scale itself is sound: 12 steps, `display` 34pt down to `micro` 11pt, weights 400–800.
It is a well-built scale rendered in a font nobody chose.

### 2.4 Radii, shadows, shape

Radii run `xs: 6` → `xxl: 32`, plus `pill: 999`. Actual usage across the app:

| Token | Value | Uses |
|---|---|---|
| `pill` | 999 | **21** |
| `md` | 14 | 20 |
| `lg` | 20 | 15 |
| `sm` | 10 | 7 |
| `xl` | 26 | 3 |
| `xxl` | 32 | 2 |

`pill` is the most-used radius in the app. Combined with 51 `<Chip>` and 10 `<Badge>`
instances, the dominant shape language is **the rounded capsule** — the default
look of a generated UI.

Shadows: a three-level `elevation()` helper, applied at 12 call sites — primary buttons,
segmented controls, toasts, list rows, skeletons, recipe cards, the home hero. Soft drop
shadows on nearly every container is a dashboard convention, not an editorial one.

### 2.5 Gradients

Four `LinearGradient` uses, and they split cleanly into two categories:

**Legitimate (keep):** `recipe-card.tsx:122` and `recipe/[id]/index.tsx:272` — dark scrims
over photography so overlaid text stays readable. Functional, invisible as gradients.

**Decorative (remove):**
- `src/app/(drawer)/(tabs)/index.tsx:53–88` — the two home hero cards. Diagonal
  orange→orange and green→green gradients, `radius.xl` (26pt), `elevation(2)` shadow,
  a 42pt translucent white circle containing a stock Ionicon, white title, white
  subtitle. **This is the most AI-generated-looking element in the product**, and it is
  the first thing a user sees.
- `src/components/recipe/recipe-image.tsx:128` — the missing-photo fallback: a diagonal
  color gradient with a translucent stock glyph centred in it.

### 2.6 Iconography

`Ionicons` is imported in **30 component files**. There is no owned icon language — every
glyph is stock. Four of them are `sparkles` / `sparkles-outline`
(`search.tsx:162`, `budget/index.tsx:170`, `about.tsx:75`, `cook/index.tsx:222`), which
the brief explicitly rules out.

### 2.7 Photography

**67 real photographs for 161 recipes.** The other **94 (58%)** render as the gradient
fallback described above. More than half of the catalogue is a colored square with a
generic icon in it. No typeface and no photography is precisely the recipe for
"AI-generated".

### 2.8 Copy

Genuinely good, and the rebrand should preserve its register. 814 English keys, scanned
for `AI`, `magic`, `smart`, `powered`, `intelligent`, `sparkle`, `wizard`, `robot`,
`brain` — **one hit**: `about.aiSuggestions: 'AI suggestions'`, on the About screen,
where naming the technology is a transparency obligation, not marketing. Zero emoji.

The AI is already invisible in the *words*. It is visible in the *sparkle icons*.

### 2.9 Dead weight

`src/components/ui/card.tsx` exports `Card`, used **zero** times outside its own tests.
It is the only component carrying `elevation` as a prop. Delete it during the rebrand
rather than restyling it.

---

## 3. What makes the current UI feel "AI-generated", and what replaces it

Ordered by how much each one costs you, worst first.

### 3.1 The gradient hero cards → editorial entry points

*Current:* two diagonal-gradient rounded rectangles with white icons in translucent
circles and white text, side by side under a greeting.

*Why it reads as generated:* this exact component — gradient card, circular translucent
icon chip, white title, white subtitle, 24pt radius, drop shadow — is the single most
reproduced pattern in generated UI. It appears in thousands of templates. A user who has
seen one app this year has seen it.

*Replacement:* flat cream surfaces, `12pt` radius, one hairline border, **no shadow, no
gradient**. Type carries the hierarchy: a `title2` label in near-black, one line of
`footnote` secondary underneath, and a single cobalt element — a small arrow, or a rule
under the label. Let the two blocks differ by *content*, not by color. If a color is
needed to distinguish them, use one cobalt block and one cream block with a cobalt rule,
never two different hues.

### 3.2 Gradient+icon photo fallbacks (94 of 161 recipes) → real photography or honest type

*Why it reads as generated:* colored gradient placeholders with centred glyphs are what
an app looks like when it has no content. Food apps live or die on appetite appeal.

*Replacement, in priority order:*
1. **Shoot or license the remaining 94.** This is the real fix and the highest-leverage
   spend in the entire rebrand. Nothing on this list buys more perceived quality.
2. Until then, replace the gradient with a **flat cream tile carrying the dish name set
   in the brand Arabic face at large size, cropped** — an editorial title card. Typographic
   placeholders read as deliberate; gradient-plus-icon reads as missing.
3. Never mix: a feed with 8 photos and 4 gradient tiles looks broken. Sort photographed
   recipes forward, or make every tile in a given row the same kind.

### 3.3 No brand typeface → Alexandria

*Replacement:* **Alexandria** (SIL Open Font License, variable, 100–900), as the brief
prefers. It is purpose-built as a bilingual Arabic/Latin family by an Egyptian foundry,
which is the rare case where the culturally right answer is also the technically right
one — one family, one metric set, no Latin/Arabic mismatch, no second font to load.

*Technical verification required before committing to it* (do this in the implementation
phase, not now): confirm it ships the Arabic weights you need as static `.ttf` files for
React Native — RN's variable-font support is still uneven, and the usual remedy is
shipping 3–4 static instances (400/600/700, plus 800 for `display`). Budget ~4 files ×
both scripts. If the Arabic cut proves too light at small sizes on Android, the fallback
is **IBM Plex Sans Arabic** (also OFL), not a Latin-only face with a system Arabic
fallback — that mismatch is exactly what the app does today.

### 3.4 Capsule shape language → editorial rectangles

*Current:* `pill` (999) is the most-used radius; 51 chips; 10 badges.

*Replacement:* retire `pill` from everything except avatars and genuine toggle controls.
Collapse the radius scale from 8 values to **4**: `none: 0`, `sm: 6`, `md: 12`, `lg: 16`.
Drop `xl: 26` and `xxl: 32` entirely — a 32pt radius on a phone-width card is a 2021
dashboard tell. Filter chips become **6pt rectangles with a 1pt border**, selected state
as a solid cobalt fill rather than a tinted capsule.

### 3.5 Shadows everywhere → borders and background steps

*Replacement:* reduce `elevation()` from three levels to **two**, and restrict it to
things that genuinely float: sheets, toasts, modals. Cards, list rows, skeletons,
segmented controls and buttons get a 1pt border or a background step instead. Flat
surfaces separated by hairlines is what "editorial" means in practice.

### 3.6 Sparkle icons → plain verbs

*Replacement:* delete all four. `budget/index.tsx:170` and `cook/index.tsx:222` are
primary submit buttons — a button that says "Find meals" needs no icon at all. A plain
confident label is more premium than a decorated one, and it is the brief's "AI should
feel invisible" rule applied literally.

### 3.7 Stock Ionicons across 30 files → a drawn icon set

*Replacement:* commission or draw ~24 icons on a consistent grid: 1.75pt stroke,
square terminals, no rounded caps, one optical size. This is the difference between an
app that *uses* icons and a brand that *has* icons. It can ship after launch — but tab-bar
icons and the app icon cannot, because those are the brand's most-reproduced assets.

### 3.8 Two different primary colors → one

*Replacement:* adopt a hero color dark enough to carry white text, delete `primaryStrong`,
and let the button, the tab-bar active state, the focus ring and the logo all be the
identical hex. Recognition comes from repetition of *one* value. Cobalt `#3155FF` does
this; paprika cannot. (§7 for the measured ratios.)

### 3.9 Icon background that doesn't match the brand

`app.json` says `#FF6B35`; the palette says `#E85D2A`. *Replacement:* single source of
truth plus a test asserting `app.json`'s brand colors equal the palette's — the same
technique the repo already uses for contrast and for edge-function imports.

---

## 4. Twelve naming candidates — ROUND 1, REJECTED

> **Superseded.** Kept as the record of what was tried and why it failed. All three
> finalists collided in external checks; see §10.0 for the post-mortem and §10 for the
> replacement round. **Do not draw names from this section.**


> **Verification caveat, stated up front.** This environment has no outbound access to
> trademark registries, app stores or domain registrars. Every availability judgement
> below is from general knowledge and is **not a clearance search**. Before committing,
> run: EGYPT TMO and WIPO Global Brand Database searches in classes 9, 35, 42 and 43;
> App Store and Google Play name searches in the EG storefront; `.com`, `.app` and `.eg`
> domain checks; and Instagram/TikTok handle checks. Assume at least two of these twelve
> will die at that step — that is why there are twelve.

### Territory A — culturally rooted but modern

#### 1. Lamma — لمّة
- **Pronunciation:** *LAM-ma* (English) / *lamma* (Arabic). Two syllables, geminated M.
- **Meaning:** the Egyptian word for a gathering — "لمّة العيلة", the family coming
  together. It names *the people around the food*, never the food.
- **Strengths:** unmistakably Egyptian without being folkloric; warm and human by
  definition; five letters; the Arabic لمّة is a compact, beautiful wordmark; passes the
  "not food vocabulary" rule cleanly while being entirely about eating.
- **Weaknesses:** the doubled M needs care in Latin transliteration (Lamma/Lama/Lammah —
  pick one and defend it); slightly opaque to a non-Arabic speaker on first contact;
  "lama" collides in Latin script with the animal and the Buddhist title.
- **Stretch beyond recipes:** excellent. Recipes → the table → friends → community
  submissions → group grocery orders are all literally "lamma". It is the only name here
  whose meaning *grows* as the product does.

#### 2. Nafas — نَفَس
- **Pronunciation:** *NA-fas*. Two even syllables.
- **Meaning:** breath — and in Egyptian kitchen idiom, a cook's touch. "نفسها حلو" is said
  of someone whose food simply tastes better. It names the human skill in cooking.
- **Strengths:** a genuinely proprietary cultural insight that outsiders don't have;
  poetic without being precious; positions the product as amplifying the *cook*, not
  replacing them — the exact opposite of AI-forward positioning.
- **Weaknesses:** نفس also reads as "self/same" and, in some contexts, "a drag on a
  cigarette"; the idiom is known to Egyptians over ~30 far more than under; harder to
  explain in an English elevator pitch.
- **Stretch:** moderate. Beautiful for cooking and community, strained for grocery
  logistics — "Nafas delivers your groceries" doesn't land.

#### 3. Zaad — زاد
- **Pronunciation:** *ZAAD*, one long syllable.
- **Meaning:** provisions — the food you pack for a journey. Also the verb "to increase".
- **Strengths:** the double meaning is a gift: provisions *and* more-of. Four letters,
  one syllable, trivially pronounceable in both languages; the single best name here for
  the grocery-ordering future; commanding as a logotype.
- **Weaknesses:** short and phonetically plain, so it needs a strong mark to carry it;
  "Zaad" is a Somali mobile-money brand and similar strings appear in Gulf commerce —
  **this one most needs a clearance search**; less warm than Lamma.
- **Stretch:** excellent, and it leans *toward* commerce. Would make the recipe app feel
  like the small first chapter of a grocery business, which may be exactly right — or
  premature.

#### 4. Baraka — بركة
- **Pronunciation:** *BA-ra-ka*. Three light syllables.
- **Meaning:** blessing, and specifically the quality that makes a small amount stretch
  to feed everyone. It is what Egyptians say about food that went further than it should
  have.
- **Strengths:** this is the budget feature expressed as a cultural value rather than a
  spreadsheet — the strongest meaning-to-product fit of any name here; warm; already
  understood across all of MENA.
- **Weaknesses:** religious register that some urban young users will find old-fashioned;
  heavily used commercially across MENA and beyond; six letters; three syllables makes it
  the least snappy candidate.
- **Stretch:** very good. Groceries, community and charity/food-sharing all sit naturally
  under it.

### Territory B — coined / ownable

#### 5. Nemma — نِعمة (respelled)
- **Pronunciation:** *NEM-ma*. Coined Latin spelling of *ni'ma*, dropping the ayin.
- **Meaning:** in Egypt, النعمة **is** the word for food — not "a blessing" abstractly, but
  the bread on the table. Every Egyptian has been told "ماتضيّعش النعمة" — *don't waste
  the blessing* — as a child. That sentence is this product's entire thesis: use what you
  already have, waste nothing, make it stretch.
- **Strengths:** the best story of the twelve, and it is a story users already carry
  before they meet the brand; the coined spelling makes it ownable where نعمة itself is
  not; five letters, two syllables, easy in both languages; anti-waste positioning is
  durable and fundable.
- **Weaknesses:** the respelling is a permanent small tax — Arabic-literate users will
  read نعمة and some will find the Latin "Nemma" a loss; mild religious register (less
  than Baraka); "Nemma" is close to "Emma" and to Italian words in Latin script.
- **Stretch:** very good. Pantry, budget, groceries, anti-waste and community all follow
  from one idea.

#### 6. Loma — لمة (internationalized)
- **Pronunciation:** *LOH-ma*. A deliberately globalized softening of *lamma*.
- **Meaning:** carries Lamma's "gathering" while reading as a clean four-letter consumer
  brand in Latin script.
- **Strengths:** four letters; looks contemporary set in any typeface; the shortest,
  most export-ready name here; keeps a real Egyptian root for the Arabic market.
- **Weaknesses:** it purchases internationalism by blurring the Arabic — Egyptians may
  hear it as a foreign word rather than theirs, which forfeits the main advantage of
  Territory A; "loma" means *hill* in Spanish and is used commercially in the US;
  meaningfully weaker in Arabic than Lamma is.
- **Stretch:** excellent — it means almost nothing, which is both the strength and the cost.

#### 7. Kanza — كنزة
- **Pronunciation:** *KAN-za*. Two hard syllables.
- **Meaning:** from كنز, treasure. As a coinage: "a treasure", and by extension the hidden
  value already sitting in your kitchen.
- **Strengths:** confident, slightly premium; the "you already own something valuable"
  read is a clean fit for a pantry product; five letters; the K/Z consonants make a
  distinctive, graphically strong wordmark.
- **Weaknesses:** كنزة also means *a sweater* in Levantine Arabic — a real comprehension
  problem for MENA expansion; Kanza exists as a European agricultural brand and as a
  given name; slightly harder in the mouth than the others.
- **Stretch:** good but abstract — nothing in it points at food, so every category
  extension is free and none is suggested.

#### 8. Nabta — نبتة
- **Pronunciation:** *NAB-ta*. Two syllables.
- **Meaning:** a sprout, a seedling — something small that grows.
- **Strengths:** freshness and growth without saying "fresh" or "food"; five letters;
  unusually clean icon territory (a two-stroke sprout is memorable at 16px, which few
  marks are); pairs beautifully with cobalt as an unexpected, non-literal combination.
- **Weaknesses:** agricultural rather than culinary — reads closer to a farming or
  sustainability app than a consumer food brand; "Nabta" is a known Egyptian
  archaeological site (Nabta Playa); risks skewing green/eco, which fights the cobalt
  direction.
- **Stretch:** good for groceries and produce, weak for community and social.

### Territory C — abstract consumer brand

#### 9. Sila — صِلة
- **Pronunciation:** *SEE-la*. Two syllables, open vowels.
- **Meaning:** a bond, a connection — specifically a maintained relationship, as in
  صلة الرحم, keeping family ties. It names the relationship, not the meal.
- **Strengths:** four letters, soft consonants, effortless in both languages; reads as a
  modern tech consumer brand in Latin script and as warm classical Arabic in صلة; the
  widest runway of any name here — social, ordering, community and logistics all fit; the
  cleanest possible wordmark.
- **Weaknesses:** the most abstract and therefore the coldest; says nothing about food,
  so the first year of marketing must do all the work; short common strings collide
  easily (Sila is a UAE border town, a given name, and a used brand string) — **needs the
  most careful clearance**.
- **Stretch:** the best of the twelve. Nothing in it would ever need to change.

#### 10. Nilo
- **Pronunciation:** *NEE-lo*. Two syllables.
- **Meaning:** from the Nile — Egypt's defining noun, rendered as a four-letter
  international brand.
- **Strengths:** instantly Egyptian without a word of Arabic; four letters, open and
  friendly; strong mark territory (a single flowing stroke); travels well.
- **Weaknesses:** Nile-derived names are extraordinarily crowded in Egypt — banks,
  universities, TV, dozens of companies — so "ownable" is questionable; "Nilo" is Spanish
  and Portuguese for the Nile and is commercially used in Latin America; risks reading as
  a national utility rather than a youthful consumer app.
- **Stretch:** excellent semantically, poor competitively.

#### 11. Taza — طازة
- **Pronunciation:** *TAA-za*. Two syllables.
- **Meaning:** "fresh" in Egyptian Arabic — what you shout about produce in the market.
- **Strengths:** the most immediately *comprehensible* name here to an Egyptian; four
  letters; direct line to pantry freshness, expiry tracking and groceries; energetic and
  young.
- **Weaknesses:** it is an adjective about food, which brushes against the "no generic
  food vocabulary" rule harder than anything else on this list; commercially crowded
  (a US chocolate brand, a Moroccan city, multiple regional grocers); hardest to
  trademark of the twelve; describes a *feature* (freshness), which is exactly the
  "feels like a feature, not a brand" failure mode.
- **Stretch:** good for grocery, poor for community and social — nothing about "fresh"
  suggests people.

#### 12. Sahla — سهلة
- **Pronunciation:** *SAH-la*. Two syllables.
- **Meaning:** "easy" — as in "it's easy", said reassuringly.
- **Strengths:** an adjective as a brand name is a proven consumer move and inherently
  confident; five letters; the promise *is* the product for a user staring into a fridge
  at 8pm; warm and colloquial in Egyptian Arabic; disarming rather than technological.
- **Weaknesses:** "easy" can read as cheap or unambitious, and can undercut a premium
  design system; سهلة is extremely common vocabulary, making trademark difficult;
  meaningless to non-Arabic speakers, limiting international runway; risks sounding like
  a discount brand next to cobalt-blue premium design.
- **Stretch:** moderate. "Easy" extends to ordering and delivery naturally; to community
  and social, barely.

---

## 5. Quick comparison — ROUND 1, REJECTED

> **Superseded by §11.** Retained as the record only.


| # | Name | Territory | Letters | Story | Stretch | Ownability | Risk |
|---|---|---|---|---|---|---|---|
| 1 | **Lamma** | rooted | 5 | ●●●●● | ●●●●● | ●●●●○ | transliteration |
| 2 | Nafas | rooted | 5 | ●●●●● | ●●●○○ | ●●●●○ | idiom skews older |
| 3 | Zaad | rooted | 4 | ●●●●○ | ●●●●● | ●●○○○ | existing use |
| 4 | Baraka | rooted | 6 | ●●●●● | ●●●●○ | ●●○○○ | crowded, religious |
| 5 | **Nemma** | coined | 5 | ●●●●● | ●●●●○ | ●●●●● | respelling tax |
| 6 | Loma | coined | 4 | ●●○○○ | ●●●●● | ●●●○○ | loses the Arabic |
| 7 | Kanza | coined | 5 | ●●●○○ | ●●●●○ | ●●●○○ | = "sweater" in Levant |
| 8 | Nabta | coined | 5 | ●●●○○ | ●●●○○ | ●●●●○ | reads eco/agri |
| 9 | **Sila** | abstract | 4 | ●●●○○ | ●●●●● | ●●●○○ | cold; collisions |
| 10 | Nilo | abstract | 4 | ●●●○○ | ●●●●○ | ●○○○○ | Nile is crowded |
| 11 | Taza | abstract | 4 | ●●●○○ | ●●●○○ | ●●○○○ | near-descriptive |
| 12 | Sahla | abstract | 5 | ●●●○○ | ●●●○○ | ●●○○○ | reads cheap |

---

## 6. The three finalists — ROUND 1, REJECTED

> **All three are dead.** Lamma, Nemma and Sila each hit existing commercial use in or
> adjacent to this category. Retained only so the reasoning is auditable. §10 replaces it.


**Lamma**, **Nemma**, and **Sila** — one from each territory, deliberately. They are not
three flavours of the same idea; they are three different strategic bets, and the choice
between them is a founder's call about what the company is, not a design question.

- **Lamma** bets that the moat is *Egyptian warmth*. Strongest culturally, hardest to
  copy, best community story. Costs you the most in international legibility.
- **Nemma** bets that the moat is *the anti-waste idea*. Best story, most ownable, and the
  only one that gives investors and press a sentence to repeat. Costs you a permanent
  small friction in Arabic spelling.
- **Sila** bets that the moat is *the platform*. Cleanest, most scalable, most
  export-ready. Costs you meaning — it will feel like the least Egyptian of the three
  until marketing makes it mean something.

**No recommendation is made.** If pushed for the tiebreaker question: *does this company
want to be Egypt's warmest food brand, Egypt's anti-waste brand, or MENA's food platform?*
Each finalist is the right answer to exactly one of those.

---

## 7. Brand systems for the three finalists — NAMES REJECTED, §7.0 STILL LIVE

> **Read §7.0 — it is approved and unaffected.** The colour, contrast, neutral ramp,
> support hues, shape and motion foundations are independent of the name and remain the
> brand direction. Only the three *named* systems (§7.1–§7.3) are void.


### 7.0 Shared foundations

All three finalists share the hero direction from the brief, because it is right for all
of them, and because the arguments for it are measurable.

**Why cobalt, in numbers.** Every ratio below was computed with the same WCAG formula the
repo's own `contrast.test.ts` uses, against the proposed cream `#FBF7F0`:

| Pair | Ratio | Verdict |
|---|---|---|
| White on `#3155FF` (cobalt 500) | **5.42:1** | passes AA body text |
| White on `#E85D2A` (current paprika 500) | 3.48:1 | **fails AA** |
| Cobalt 500 on cream | 5.08:1 | passes AA |
| Cobalt 600 `#2442D6` on cream | 6.96:1 | passes AAA-adjacent |
| Ink `#12100E` on cream | 17.78:1 | passes AAA |
| Cobalt 400 `#5B78FF` on dark `#0E0F13` | 5.09:1 | passes AA — dark-mode primary |
| Cobalt 500 on dark `#0E0F13` | 3.53:1 | large text / UI only — do **not** use as dark-mode body |

The consequence: **cobalt lets the brand have one primary color instead of two**, and the
`primaryStrong` token can be deleted. That alone is worth the switch.

**Shared neutral ramp** (all verified against cream):

```
ink        #12100E   primary text          17.78:1 on cream
slate      #6B6560   secondary text         5.38:1 on cream  (AA body)
mist       #8C857E   tertiary / meta        3.41:1 on cream  (large text only)
line       #E6DFD3   hairline borders       decorative, not text
cream      #FBF7F0   page background
shell      #F5EFE5   grouped sections
white      #FFFFFF   cards
```

Note `#78716C` — the obvious "warm grey 500" — measures **4.49:1** and fails body text by
one hundredth. Use `#6B6560`. This is the kind of thing that only shows up when you
measure.

**Shared support hues** (chosen so white-on-fill clears 4.5:1, unlike today's):

```
green  #1F7A4D   white-on-it 5.32:1   have-it / in stock
amber  #9A6207   white-on-it 5.09:1   expiring soon
red    #C0341F   white-on-it 5.60:1   expired / destructive
```

**Shared shape and motion rules**
- Radii collapse to four: `0 / 6 / 12 / 16`. `pill` survives for avatars only.
- Elevation collapses to two levels, used only for sheets, toasts and modals.
- No decorative gradients. Photo scrims only.
- Motion keeps the existing durations — they are already restrained.

---

### 7.1 LAMMA — لمّة

> *The gathering.*

**Primary** — Cobalt `#3155FF`. Warm cobalt: for Lamma only, the cream shifts one step
warmer (`#FBF6EE`) so the blue reads as *evening light on a table*, not as a fintech blue.

**Secondary neutrals** — The shared ramp, plus one owned accent: **Tile** `#C0341F`, a
deep terracotta red drawn from Egyptian tilework, used **only** for destructive actions and
one editorial accent in marketing. Never a second brand color in-app. Two colors total.

**Typography** — Alexandria throughout. Arabic leads: the Arabic cut is the primary
design object and the Latin is set to match its weight and rhythm, not the reverse.
Display 800, headings 700, body 400, meta 600. Headlines set **tight** (-2% tracking) and
large; body set generously.

**Icon concept** — **The table from above.** A circle (the tray) with three to five short
strokes radiating inward from the edge — people seated. Reads as a sun, a gathering, and
a Ramadan table at once. Works at 16px, works as a single-color app icon, works as a
loading animation (strokes arriving one at a time). Cobalt strokes on cream, or reversed.

**Wordmark** — Arabic-primary lockup: **لمّة** set large in Alexandria 800, with the
shadda deliberately retained as a design feature rather than dropped; **lamma** set beneath
in lowercase Latin at half the size, letterspaced. Lowercase always — it is a warm word,
not an institution. The mark sits left of the wordmark in Latin, right in Arabic.

**Tone of voice** — The friend who cooks. Second person, present tense, contractions in
English, Egyptian colloquial in Arabic (not MSA). Short sentences. Never exclamatory,
never instructional. It states what is true and gets out of the way.
- *Yes:* "You've got everything for koshari."
- *No:* "Great news! You can make koshari! 🎉"

**Sample push notification**
> **EN —** Three things in your kitchen are about to turn. Here's what to cook tonight.
> **AR —** تلات حاجات في مطبخك قربت تخلص. دي أكلة تنفع النهارده.

**Sample Instagram bio**
> لمّة · Cook what you already have.
> Egyptian recipes matched to your kitchen and your budget.
> Cairo 🇪🇬

**Sample launch headline**
> **Your kitchen already has dinner in it.**

---

### 7.2 NEMMA — نِعمة

> *Don't waste the blessing.*

**Primary** — Cobalt `#3155FF`, used at higher density than the other two: Nemma is the
most confident of the three, so cobalt appears as **full-bleed blocks**, not just accents.
Section headers can be reversed white-on-cobalt.

**Secondary neutrals** — The shared ramp, run cooler (`#FAF7F1`), so cobalt stays crisp
rather than warm. **Single accent: none.** Nemma's discipline is that there are exactly
two colors in the product — cobalt and ink on cream — with the three support hues
appearing only as small status marks. This is the most rigorous of the three systems and
the most recognizable for it.

**Typography** — Alexandria, used **editorially**: very large display sizes (40–56pt in
marketing), very short lines, heavy contrast between a 800-weight headline and a 400-weight
body with nothing in between. No mid-weight subheadings. The typographic rhythm — enormous,
then small, nothing in the middle — becomes as recognizable as the color.

**Icon concept** — **A grain, held.** A single wheat grain or seed form rendered as one
closed shape with one interior stroke, sitting inside an open bracket or cupped curve.
Reads as "something small, kept safe" — the anti-waste idea in one mark. Solid cobalt,
no outline version. At 16px it becomes a simple seed silhouette.

**Wordmark** — Latin-primary, unusually: **nemma** in Alexandria 800, lowercase, tracked
tight, with the two Ms deliberately touching to form one connected form. **نعمة** set
adjacent at matched optical weight for the Arabic market. The touching-Ms ligature is the
ownable detail — a small, repeatable signature.

**Tone of voice** — Plain-spoken and slightly moral, without preaching. It believes waste
is a real thing to care about, and says so in short declaratives. No jokes about hunger.
Numbers are used, because thrift is measurable.
- *Yes:* "Two tomatoes left. That's enough for shakshuka."
- *No:* "Don't let those tomatoes go to waste! Try shakshuka! ✨"

**Sample push notification**
> **EN —** You have tomatoes, eggs and bread. That's shakshuka — 18 EGP, twenty minutes.
> **AR —** عندك طماطم وبيض وعيش. ده شكشوكة — ١٨ جنيه، عشرين دقيقة.

**Sample Instagram bio**
> نعمة · Nothing in your kitchen goes to waste.
> Recipes from what you have. Prices before you cook.
> Made in Egypt.

**Sample launch headline**
> **Nothing goes to waste.**

---

### 7.3 SILA — صِلة

> *The connection.*

**Primary** — Cobalt `#3155FF`, treated as a **structural** color rather than a decorative
one: it appears as rules, underlines, active states and one filled action per screen.
Sila is the most restrained system — the color does load-bearing work and nothing else.

**Secondary neutrals** — The shared ramp at its coolest (`#FAF8F4`, nearly paper), plus a
deliberately wider grey range, because an abstract brand needs typographic and spatial
hierarchy to do the work that meaning does in the other two. Add `slate-deep #4A4540` as a
fourth text tone.

**Typography** — Alexandria, but with a **type-led identity**: Sila's recognition comes
from layout, not color. Consistent left rule on every section header, consistent 4-column
underlying grid visible in the alignment of everything, generous vertical rhythm. The
screenshot should be recognizable in greyscale — that is the test.

**Icon concept** — **Two arcs meeting.** Two open curves whose ends touch at a single
point, forming neither a circle nor a link but the moment of contact. Abstract, calm,
memorable in outline at any size, and it animates naturally (the arcs travel and meet on
load). Cobalt on cream, single weight, no fill.

**Wordmark** — Fully bilingual and symmetrical: **sila** / **صلة** set at identical optical
size and weight, stacked or side by side with a hairline cobalt rule between them. The
symmetry *is* the identity — the brand looks the same in both languages, which no
competitor in the market does.

**Tone of voice** — Calm, spare, confident. Fewer words than seem necessary. No idiom in
either language, because idiom doesn't travel and Sila's bet is travel. Arabic is clean
modern standard rather than colloquial, so it reads as naturally in Riyadh as in Cairo.
- *Yes:* "Six recipes from what you have."
- *No:* "We found 6 delicious recipes you can make right now!"

**Sample push notification**
> **EN —** Six recipes from what's in your kitchen tonight.
> **AR —** ست وصفات مما لديك في مطبخك الليلة.

**Sample Instagram bio**
> صلة · Sila
> What you have. What it costs. What to cook.
> Cairo → MENA

**Sample launch headline**
> **What you have is enough.**

---

## 8. Recommended sequence (for approval, not execution)

Nothing below has been started.

1. **Founder picks a name.** Everything else blocks on this.
2. **Clearance.** Trademark, stores, domains, handles — per the caveat in §4. Hold a
   second finalist in reserve.
3. **Design tokens first, name second.** The palette, radius, elevation and typography
   changes in §3 and §7.0 are *independent of the name* and improve the product on their
   own. They can land before the name is final, and they de-risk the rebrand by separating
   "does the new design work" from "does the new name work".
4. **Typeface.** Confirm Alexandria's static weights on RN/Android, then ship the fonts.
5. **Tiers 1, 2 and 4** of the rename together, in one release, before any store build.
6. **Tier 3** as its own staged change, with the Supabase redirect allow-list updated in
   lockstep and a storage-key migration — or a deliberate decision to leave the `akla.*`
   prefix permanently, which is a legitimate and much safer choice.
7. **Tier 5** with a data migration.
8. **Photography for the remaining 94 recipes** — highest perceived-quality return of
   anything in this document, and entirely independent of the name.
9. **Icon set**, post-launch, except the app icon and tab icons.

## 9. Guardrails carried from the brief

Recorded here so implementation can be checked against them:

- No gradients except photo scrims. No glassmorphism. No purple.
- No sparkles, robots, brains or magic wands, in icons or in copy.
- No AI-forward language. The About screen's honest "AI suggestions" disclosure stays.
- Real photography, or typographic placeholders — never gradient-plus-glyph tiles.
- Radii capped at 16pt. Pills only for avatars.
- Chips, badges and cards are rationed, not decorative.
- Flat and editorial: borders and background steps instead of shadows.
- One primary color, one hex, everywhere.

---

## 10. Naming Round 2 — ownability-first

### 10.0 Why Round 1 failed, precisely

All three finalists were high-frequency emotional Arabic words. That is exactly why they
collided: **every founder in this category reaches into the same small vocabulary.** لمة,
نعمة and صلة are among the warmest, most obvious nouns available for a food-and-people
brand in Arabic, so the probability that each was already taken approached one. The names
were good; the search space was exhausted before the search began.

Two structural lessons carry into this round.

**Lesson one: meaning and ownability trade against each other in Arabic, harder than in
English.** Arabic builds words from triliteral roots, so a native speaker can *derive* the
meaning of almost any well-formed word. The effect is that Arabic has very few
pronounceable-but-empty slots — nearly every shape like CaCCa already means something,
and the ones that mean something warm are already trademarked. English brand-builders can
coin freely (Google, Kodak, Uber) because English tolerates meaningless strings. Arabic
punishes them: a meaningless Arabic-shaped word sounds like a *mistake* rather than an
invention, unless it is built carefully.

**Lesson two: the fix is phonotactic, not semantic.** Searching for a *better meaning*
produces more collisions, because meaning is the crowded axis. This round searches for
**sound-shapes that are legal in Arabic but not occupied by it** — words an Egyptian can
say instantly and confidently, that carry a faint root echo, and that are not entries in
any dictionary. That is the axis with room left on it.

### 10.1 The four coinage techniques used here

Rather than listing whatever sounded nice, Group A is built with four named methods, so
the founder can see the craft and generate more if clearance kills these too.

1. **Root-echo suffixing.** Take a live root (رزق, زاد, رمز, حنو) and attach a real Arabic
   noun ending (-wa, -za, -da, -ra) that the root does not actually take. The result is
   *derivable but not derived* — Egyptians feel the meaning without recognising the word.
2. **Dialect respelling.** Take a word whose Egyptian pronunciation already differs from
   its written form and spell the *Egyptian* one in Latin. The Latin brand is then
   distinct from the dictionary entry it came from.
3. **Rare-register revival.** Use a classical word so uncommercialised it behaves as a
   coinage in practice, and accept that it must be taught.
4. **Pure construction.** No root at all; built only for mouth-feel in both languages and
   for strength in Latin capitals. Legally the cleanest, semantically the most expensive.

### 10.2 Screening applied before a name reached this list

Every one of the 30 was checked against the constraints, and candidates that failed were
dropped rather than listed. Recorded so the screen is auditable:

- **No banned substring** — food, cook, chef, meal, pantry, fridge, recipe, plate, bite,
  kitchen. This eliminated an otherwise excellent candidate, **Wasfa** (وصفة), which means
  *a recipe* — the ban in its purest form.
- **No cookware or ingredient words.** Killed *Rakwa* (the coffee pot), *Tawa* (the pan),
  *Sawka* (the fork), *Zabda* (butter), *Roka* (arugula), *Nakha* (flavour), *Sorba*.
- **No negative or unfortunate second reading.** Killed *Zafra* (زفر also means a greasy
  or fishy smell — fatal for food), *Nazwa* (a caprice), *Nazla* (a head cold), *Hawla*
  (a squint), *Dahna* (grease), *Balwa* (a calamity), and **Nakba**, which needs no
  explanation.
- **No collision with the rejected three, or close phonetic variants.** This removed
  *Hemma*, *Tamma* and *Gemma* for rhyming with Nemma, and *Zala* and *Sella* for
  shadowing Sila.
- **No adjacency to the named competitors.** Removed *Tolba* and *Talda* (Talabat),
  *Nuro* (Noon), and anything ending *-menu*.
- **No Arabizi, no numerals.** Removed *Sar7a*, the natural chat spelling of one candidate.
- **No `v` and no `p`.** Egyptian Arabic has neither; speakers substitute ف and ب, so any
  brand containing them is mispronounced by its own home market on day one.
- **Politically or religiously loaded.** Removed *Kifaya* (the 2004 protest movement),
  *Nahda*, *Sahwa*, *Safwa*, *Omra*, *Zahd*.
- **Already a large regional company.** Removed *Wamda* (MENA startup media — a
  particularly dangerous near-miss, since it is in the startup press business), *Zain*
  (telecom), *Arma* (Egyptian food industry), *Barwa*, *Sarwa*, *Wasla*, *Rotana*.

---

## 11. The thirty candidates

### Group A — Highly coined (10)

Built by techniques 1, 2 and 4. None is a dictionary entry in any register of Arabic.

#### A1 · Razwa — رزوة
- **Say it:** RAZ-wa
- **Origin:** technique 1. From رِزق *rizq*, the provision that arrives to you, plus the
  live noun ending *-wa* (as in نشوة، حظوة) that this root does not take.
- **Feels like:** quiet abundance; something arriving without being chased.
- **Likely misspellings:** Razwah, Rezwa, Raswa, Razwaa
- **Same in both mouths?** Yes — no emphatic consonant, no ayn, no qaf. An Egyptian and a
  Londoner produce nearly the same sound.
- **Weakness:** the Z–W sequence is rare in Latin-script brands and needs one beat of
  learning; carries no meaning whatsoever for a non-Arabic speaker.

#### A2 · Zadra — زادرة
- **Say it:** ZAD-ra
- **Origin:** technique 1. From زاد *zād*, the provisions you pack for a journey, plus *-ra*.
- **Feels like:** stocked and ready; about to go somewhere.
- **Likely misspellings:** Zaadra, Zadrah, Sadra, Zahdra
- **Same in both mouths?** Yes.
- **Weakness:** one letter from *Sadra* (Mulla Sadra, a major Persian philosopher); the
  D–R cluster is slightly stiff; reads a little clinical next to the warmer options.

#### A3 · Rimza — رمزة
- **Say it:** RIM-za
- **Origin:** technique 1. From رمز *ramz*, a symbol or sign. رمزة is not a standard noun.
- **Feels like:** a small sign that stands for something larger.
- **Likely misspellings:** Rimsa, Remza, Ramza, Rimzah
- **Same in both mouths?** Yes.
- **Weakness:** serious — رمز is the standard in-app Arabic word for a *verification code*
  ("رمز التحقق"). Arabic speakers may hear something technical and transactional rather
  than warm, which is the opposite of the brief.

#### A4 · Hanwa — حنوة
- **Say it:** HAN-wa
- **Origin:** technique 1. From حنو / حنان *ḥanān*, tenderness — the specific affection
  associated with a mother.
- **Feels like:** being cared for; warmth directed at a person.
- **Likely misspellings:** Hanwah, Hanua, Henwa, Hannwa
- **Same in both mouths?** Nearly. Arabic ح is a throat H; English gives a plain /h/. Same
  word, different texture — the most common and most survivable compromise in MENA branding.
- **Weakness:** that ح drift; and it sits near the Gulf given name Hanouf.

#### A5 · Rozna — روزنة
- **Say it:** ROZ-na
- **Origin:** technique 4, with a faint echo of روزنامة *roznāma* (the almanac) and of
  روزنة, a small window in Levantine usage.
- **Feels like:** a small opening onto something; a daily rhythm.
- **Likely misspellings:** Rosna, Roznah, Rozana, Ruzna
- **Same in both mouths?** Yes — one of the cleanest here.
- **Weakness:** *Rozana* is an established Syrian radio station and a common given name,
  one letter away; reads faintly Eastern European in Latin script.

#### A6 · Rakza — ركزة
- **Say it:** RAK-za
- **Origin:** technique 1. From ركز *rakaza*, to plant firmly, to fix in place, to focus.
- **Feels like:** steady and grounded; deliberate rather than frantic.
- **Likely misspellings:** Raksa, Rakzah, Rekza, Raqza
- **Same in both mouths?** Yes.
- **Weakness:** close to رقصة *raqṣa*, "a dance", in written Arabic — though Egyptian
  pronunciation ("ra'sa") separates them in speech. The K–Z cluster is the least fluid
  in this group.

#### A7 · Nabza — نبضة
- **Say it:** NAB-za
- **Origin:** technique 2. نبضة *nabḍa* is a single pulse or heartbeat — a real word,
  almost entirely uncommercialised. Spelling it with *z* rather than the emphatic *ḍ*
  makes the Latin brand a deliberate respelling, not the dictionary entry.
- **Feels like:** alive and quick; a signal with a rhythm.
- **Likely misspellings:** Nabda, Nabsa, Nabzah, Nabtha
- **Same in both mouths?** Close, not identical. Egyptians will say NAB-ḍa; English
  speakers NAB-za. The brand must choose one and hold it in both scripts.
- **Weakness:** that consonant drift is a permanent small tax; and "pulse" is worn out as
  a metaphor in health and fitness branding.

#### A8 · Sabwa — صبوة
- **Say it:** SAB-wa
- **Origin:** technique 3. صبوة *ṣabwa*, a rare classical word for youthful yearning.
- **Feels like:** young and eager; faintly romantic.
- **Likely misspellings:** Sabwah, Sabua, Sobwa, Sabwaa
- **Same in both mouths?** Near-identical; ص is emphatic but barely audible in this position.
- **Weakness:** so rare that most Egyptians will not recognise it — which forfeits the
  benefit of an Arabic root and leaves it behaving exactly like a pure coinage, with the
  same marketing cost.

#### A9 · Rafda — رفدة
- **Say it:** RAF-da
- **Origin:** technique 1. From رفد *rafd*, to supply or support someone.
- **Feels like:** backing; supply; having someone behind you.
- **Likely misspellings:** Rafdah, Raphda, Rafta, Refda
- **Same in both mouths?** Yes, very clean.
- **Weakness:** probably disqualifying — رفض *rafḍ*, "refusal", is one emphatic consonant
  away and vastly more common. A meaningful share of Arabic speakers will hear "rejection"
  on first contact. Listed so the near-miss is on the record.

#### A10 · Tanza — تنزة
- **Say it:** TAN-za
- **Origin:** technique 4. No root in either language; built purely for bilingual mouth-feel
  and for strength in Latin capitals.
- **Feels like:** nothing yet — deliberately empty, to be filled by the product.
- **Likely misspellings:** Tansa, Tanzah, Tenza, Tanzaa
- **Same in both mouths?** Yes, identical.
- **Weakness:** English speakers hear the first syllables of "Tanzania"; and being
  genuinely meaningless, it demands the largest marketing spend of any name here to come
  to mean anything at all. Legally the easiest to clear, commercially the most expensive.

---

### Group B — Subtle Egyptian / Arabic root (10)

Real words, chosen for being *uncrowded* rather than for being evocative — the Round 1
mistake inverted.

#### B1 · Wansa — ونسة
- **Say it:** WAN-sa
- **Origin:** Egyptian colloquial ونسة, from أنس *uns* — the pleasure of company.
  "ونسة حلوة" describes an evening with someone whose company you enjoyed. It names the
  companionship, never the food.
- **Feels like:** not eating alone; what a shared table is actually for.
- **Likely misspellings:** Wanssa, Wansah, Onsa, Wanza
- **Same in both mouths?** Yes — W, N and S are identical in both.
- **Weakness:** a known colloquial word, so ownability is moderate rather than high;
  the initial W is unusual for a consumer brand (distinctive, but it fights autocorrect);
  and the word is somewhat more Gulf-inflected than "Egyptian-first" implies.

#### B2 · Rahba — رحبة
- **Say it:** RAH-ba
- **Origin:** رحبة, the wide open square or courtyard of an old town, from the root رحب —
  the same root that produces مرحبا and أهلاً وسهلاً, the entire Arabic vocabulary of welcome.
- **Feels like:** an open space with room for everybody; hospitality at scale.
- **Likely misspellings:** Rahbah, Raheba, Rehba, Rahaba
- **Same in both mouths?** Partly — ح again, throat H versus plain H.
- **Weakness:** the ح drift; rare enough that most Egyptians will not know it; and Rahba
  is a place name in both Syria and Lebanon.

#### B3 · Wafra — وفرة
- **Say it:** WAF-ra
- **Origin:** وفرة *wafra*, abundance — from وفّر, which in daily Egyptian means *to save
  money*. One word holding both "plenty" and "thrift", which is this product's exact promise.
- **Feels like:** having enough; more, for less.
- **Likely misspellings:** Wafrah, Wafira, Waffra, Wofra
- **Same in both mouths?** Yes, clean.
- **Weakness:** legally weak. It is a plain dictionary word, it is arguably *descriptive*
  of the benefit — which is a recognised ground for refusal — and Wafra is a well-known
  agricultural region in Kuwait. Best meaning in Group B, worst trademark prospects.

#### B4 · Sarha — سرحة
- **Say it:** SAR-ha
- **Origin:** Egyptian colloquial سرحة, a wander with no fixed destination — "خرجنا سرحة".
- **Feels like:** unhurried; out in the city with time to spare.
- **Likely misspellings:** Sarhah, Sar-ha, Sarhaa (and inevitably the Arabizi *Sar7a*,
  which the brief rules out but users will type anyway)
- **Same in both mouths?** Partly — ح again.
- **Weakness:** سرح also means *to zone out*, and "aimless wandering" is the wrong promise
  for a product whose whole value is *knowing* what to make.

#### B5 · Zahwa — زهوة
- **Say it:** ZAH-wa
- **Origin:** زهوة, from زهو — radiance, bloom, quiet pride in something.
- **Feels like:** understated confidence; something in bloom.
- **Likely misspellings:** Zahwah, Zahoa, Zohwa, Zahaw
- **Same in both mouths?** Yes — no emphatic or throat consonants at all.
- **Weakness:** an established female given name across the Gulf and North Africa, which
  complicates both trademark and social handles; and it is one letter from زهرة *zahra*,
  "flower", one of the most commercially used words in Arabic.

#### B6 · Sanad — سند
- **Say it:** SA-nad
- **Origin:** سند, the support you lean on — a prop, a backing, the person who has your back.
- **Feels like:** solidity; something reliable behind you.
- **Likely misspellings:** Sannad, Sened, Sanand, Sanadd
- **Same in both mouths?** Yes — effortless and identical, the best phonetics in Group B.
- **Weakness:** almost certainly uncleanable. سند is the standard Arabic word for a
  financial *bond*, the technical term for a hadith's chain of transmission, and the name
  of multiple MENA financial and charitable programmes.

#### B7 · Hedwa — هدوة
- **Say it:** HED-wa
- **Origin:** Egyptian colloquial هدوة, from هدوء *hudū'* — calm.
- **Feels like:** the opposite of the 7pm panic in front of an open fridge. The most
  literal description of the product's emotional job on this list.
- **Likely misspellings:** Hedwah, Hidwa, Hadwa, Hudwa
- **Same in both mouths?** Yes — هـ is a plain H in both, unlike the ح names above.
- **Weakness:** visually close to Hedwig and to the Hebrew name Hedva in Latin script; and
  "calm" is a soft promise that may not stretch to carrying a commerce business.

#### B8 · Wasma — وسمة
- **Say it:** WAS-ma
- **Origin:** وسم *wasm*, a mark burned into something to show ownership — and, since
  roughly 2012, the standard Arabic word for a *hashtag*. Literally "the mark".
- **Feels like:** identity; being marked as yours.
- **Likely misspellings:** Wasmah, Wasema, Wassma, Wasmaa
- **Same in both mouths?** Yes.
- **Weakness:** `.wasm` is the file extension for WebAssembly, so every technical search
  collides; وسمة also names a plant used as a dark hair dye in Gulf tradition; and naming
  a brand "the brand" is a shade too clever about itself.

#### B9 · Dafa — دفا
- **Say it:** DA-fa
- **Origin:** Egyptian colloquial دفا — warmth. The physical warmth of a room, a blanket,
  a body. Four letters.
- **Feels like:** the brief's most-repeated adjective, turned into a noun.
- **Likely misspellings:** Daffa, Dafaa, Dafah, Difa
- **Same in both mouths?** Yes, effortless in both.
- **Weakness:** very short and phonetically plain, so the mark would have to do nearly all
  the work; دفاع *difā'* ("defence") is close in writing; and "Dafa" is a Wolof word and a
  West African surname, so international collisions are near-certain.

#### B10 · Baseta — بسيطة
- **Say it:** ba-SEE-ta
- **Origin:** بسيطة — the Egyptian reassurance meaning "it's nothing, don't worry about it".
  Said constantly, and always kindly.
- **Feels like:** tension leaving a problem; a friend telling you this is handled.
- **Likely misspellings:** Basita, Baseeta, Basetta, Bseta
- **Same in both mouths?** Yes, though English speakers will tend to stress the first
  syllable rather than the second.
- **Weakness:** six letters and three syllables, the longest here; "it's simple" is one
  step from "it's cheap", which fights a premium cobalt system; and the phrase is so
  common that legal distinctiveness is close to zero.

---

### Group C — Abstract consumer-tech (10)

Latin-first legibility, minimal semantic load, still comfortable in an Egyptian mouth.

#### C1 · Nefer — نفر
- **Say it:** NEH-fer
- **Origin:** two roots at once. In Ancient Egyptian *nfr* meant good, complete, beautiful
  — the first syllable of Nefertiti. In modern Egyptian Arabic نفر means *one person*
  ("كام نفر؟" — how many people?). Goodness in the country's oldest language, and a human
  head-count in its most everyday one.
- **Feels like:** good, in the deepest sense this country has; and a person, in the most
  ordinary.
- **Likely misspellings:** Neffer, Nafar, Nepher, Nefr
- **Same in both mouths?** Not quite. Arabic نفر is "NA-far"; the Latin "Nefer" invites
  "NEH-fer". The brand must fix one pronunciation and teach it in both scripts.
- **Weakness:** that vowel drift; pharaonic reference risks reading touristic, which the
  brief rules out; and نفر can be slightly coarse in Egyptian when counting labourers.

#### C2 · Bosla — بوصلة
- **Say it:** BOS-la
- **Origin:** بوصلة, compass — borrowed into Arabic from the Italian *bussola* centuries
  ago, which is exactly why it sits easily in both scripts.
- **Feels like:** direction. Knowing which way to go without being told what to do — a
  precise description of a recommendation product that refuses to be bossy.
- **Likely misspellings:** Bousla, Bosila, Busla, Boslah
- **Same in both mouths?** Yes — the shared Italian ancestry does the work for you.
- **Weakness:** "compass" is a well-worn startup metaphor and Bosla/Boussole names already
  exist in MENA media and education; ص is emphatic, so the Arabic is a touch heavier than
  the Latin suggests.

#### C3 · Kado — كادو
- **Say it:** KA-do
- **Origin:** كادو, the Egyptian borrowing of the French *cadeau* — a gift. Universally
  understood in Cairo.
- **Feels like:** something given rather than sold.
- **Likely misspellings:** Cado, Kadoo, Kadu, Caddo
- **Same in both mouths?** Yes, identical.
- **Weakness:** a loanword, so it carries no Egyptian ownership at all; a very common
  four-letter string, so handles and marks will be gone; and "gift" mis-sets expectations
  for a product that will eventually charge money.

#### C4 · Dima — ديما
- **Say it:** DEE-ma
- **Origin:** Egyptian colloquial ديما — "always".
- **Feels like:** permanence; the app you keep rather than the one you try.
- **Likely misspellings:** Deema, Deama, Dimah, Dema
- **Same in both mouths?** Yes.
- **Weakness:** Dima is a very common Levantine female given name, and a short common
  string with heavy existing commercial use. Ownability is the lowest in Group C.

#### C5 · Zenta — زنتا
- **Say it:** ZEN-ta
- **Origin:** technique 4, pure construction. Z and T are the two most graphically
  distinctive consonants available in Latin, and the shape is a clean two-syllable trochee.
- **Feels like:** nothing inherently — deliberately empty.
- **Likely misspellings:** Zenda, Zanta, Xenta, Zentah
- **Same in both mouths?** Yes, identical.
- **Weakness:** the "Zen" first syllable imports a wellness/mindfulness association that
  actively fights Egyptian warmth; and Zenta is a historical Central European place name
  (the Battle of Zenta, 1697).

#### C6 · Korba — كوربة
- **Say it:** KOR-ba
- **Origin:** كوربة — Cairo's own word, from the English "curve", and the name of the
  Heliopolis district built around one. Egyptian in the most specific, least folkloric way
  available.
- **Feels like:** a real place with arcades and old shopfronts; urban and unpretentious.
- **Likely misspellings:** Corba, Kurba, Korbah, Qorba
- **Same in both mouths?** Yes.
- **Weakness:** two problems, either fatal. Naming a national brand after one affluent
  Cairo neighbourhood is limiting and can read as exclusionary. And *çorba / corba* means
  **soup** in Turkish and across the Balkans — a food-word collision the brief explicitly
  rules out, invisible from Cairo and unmissable anywhere north of it.

#### C7 · Marsa — مرسى
- **Say it:** MAR-sa
- **Origin:** مرسى, a mooring or harbour — where a boat ties up. Familiar to every Egyptian
  through Marsa Alam and Marsa Matrouh.
- **Feels like:** arrival; somewhere to put things down.
- **Likely misspellings:** Marssa, Mersa, Marsah, Marza
- **Same in both mouths?** Yes.
- **Weakness:** in Egypt it is strongly bound to Red Sea tourism, which drags the brand
  toward travel; and Marsa is commercially used in Malta, Tunisia and Libya.

#### C8 · Kobri — كوبري
- **Say it:** KOB-ri
- **Origin:** كوبري, the Egyptian word for a bridge, borrowed from the Turkish *köprü*.
  Ordinary Cairene street vocabulary — the opposite of folkloric.
- **Feels like:** getting from one side to the other. What you have on one bank, dinner on
  the other.
- **Likely misspellings:** Kobry, Kubri, Kobree, Copri
- **Same in both mouths?** Close. Egyptians say KOB-ri; English speakers drift to
  "KOH-bree". Minor, and correctable by the wordmark's own stress.
- **Weakness:** visually near *cobra* in Latin script, which is a poor association for a
  warm brand; كوبري appears in many Cairo place names (Kobri El Qobba), diluting it
  locally; and the *-i* ending is uncommon for a consumer brand.

*(Replaces an earlier candidate, Sanza, which was cut on measurement rather than taste:
a bigram-similarity check across all thirty flagged it at 0.75 against Tanza in Group A.
Two near-identical pure coinages would have wasted a slot, and the second one was also
one letter from Sansa.)*

#### C9 · Karo — كارو
- **Say it:** KA-ro
- **Origin:** كارو, the Egyptian word for a hand- or animal-drawn cart, from the Italian
  *carro*. The cart is, quite literally, the grocery metaphor.
- **Feels like:** everyday street commerce; the thing that carries your shopping home.
- **Likely misspellings:** Carro, Karro, Caro, Kharo
- **Same in both mouths?** Yes.
- **Weakness:** likely disqualifying in-market, and completely invisible from outside it —
  عربية كارو carries a distinctly downmarket class connotation in Egypt that a premium
  cobalt brand cannot outrun. Included because the lesson generalises: only local review
  catches this class of failure.

#### C10 · Tiba — طيبة
- **Say it:** TEE-ba
- **Origin:** طيبة — simultaneously the ancient Arabic name for Thebes (Luxor) and the
  ordinary noun for goodness of character. Egypt's oldest city and its most-praised human
  quality, in four letters.
- **Feels like:** decency — the quality Egyptians reach for first when they describe
  someone they like.
- **Likely misspellings:** Teeba, Tayba, Theba, Tiban
- **Same in both mouths?** Mostly — ط is emphatic, so the Arabic "Ṭeeba" lands heavier
  than the English "Teeba".
- **Weakness:** Tiba/Teiba is a common Egyptian given name and appears across local
  business names — schools, clinics, compounds. Beautiful story, low distinctiveness.

### 11.1 Mechanical screen — run, not assumed

All thirty were checked by script rather than by eye, against: length 4–7; no digits; none
of the ten banned substrings; no `v` or `p`; bigram similarity below 0.5 against *lamma*,
*nemma*, *sila*, *talabat*, *breadfast*, *elmenus*, *rabbit*, *instashop* and *noon*; and
below 0.6 against each other. **All thirty pass.** The check earned its keep once — it
flagged an internal near-duplicate at 0.75 that reading the list had not caught, and that
slot was re-filled.

One honest artefact of the method: the endings cluster. Five of the thirty end in *-wa*
and four in *-za*, because those are among the few Arabic noun endings that attach cleanly
to a root without producing a real dictionary word. That is the cost of technique 1, and it
is worth knowing that a shortlist drawn only from Group A will sound more alike than
thirty independently-chosen names would.

---

## 12. The eight for external clearance

Selected for ownability first, as instructed, then for the "download ____" test and for
whether the name still makes sense when the company sells groceries. **Four of the eight
are Group A coinages**, which is the deliberate consequence of prioritising ownability:
invented words are the only ones with real room left in the register.

Ordered by my assessment of combined strength and clearance odds.

| # | Name | Arabic | Group | Why it earned a slot | What clearance must resolve |
|---|---|---|---|---|---|
| 1 | **Razwa** | رزوة | A · coined | Cleanest coinage found: no dictionary entry, no negative second reading, no emphatic-consonant drift, root echo of "provision" that scales straight into groceries. | Nothing known. The highest-confidence candidate on the list. |
| 2 | **Wansa** | ونسة | B · rooted | The warmest name here and the only one whose meaning is *companionship* rather than food — it scales to friends, community and shared ordering without stretching. | Gulf usage; whether any MENA social or delivery app holds it. |
| 3 | **Nabza** | نبضة | A · respelled | Graphically the strongest in Latin (N-B-Z), energetic, short, and near-uncommercialised in Arabic. | Whether the ض→z respelling is defensible as distinct; "pulse" crowding in health tech. |
| 4 | **Nefer** | نفر | C · abstract | The most *ownable* story of all thirty — two authentic Egyptian layers, four thousand years apart, in one five-letter word. | Pharaonic naming is popular in Egyptian tourism; check hospitality and travel classes especially. |
| 5 | **Hanwa** | حنوة | A · coined | Delivers the brief's core adjective — warm, human — through a real root, with no dictionary entry to collide with. | Proximity to the given name Hanouf; confirm the ح/h split is acceptable to the founder. |
| 6 | **Zadra** | زادرة | A · coined | Commanding as a logotype, strong provisions root, the best pure-grocery fit among the coinages. | *Sadra* proximity; check Persian/Gulf commercial use. |
| 7 | **Bosla** | بوصلة | C · abstract | The most scalable of all thirty — "the compass" stays true through recipes, pantry, community and ordering alike, and needs no translation. | Compass-metaphor crowding; existing Bosla/Boussole media and education brands in MENA. |
| 8 | **Rahba** | رحبة | B · rooted | Hospitality encoded at the root level — the same root as *marhaba* — and a genuinely uncrowded word. | Syrian and Lebanese place-name use; whether the ح drift is tolerable. |

**Deliberately not submitted, and why** — so the omissions are decisions rather than
oversights: **Rafda** (hears as "refusal"), **Rimza** (hears as "verification code"),
**Korba** (means *soup* north of Egypt), **Karo** (downmarket class signal in Cairo),
**Sanad** and **Baseta** and **Wafra** (too common to clear; Wafra additionally risks a
descriptiveness refusal), **Kobri** (reads as *cobra*), **Zenta** (Zen), **Dima** and **Kado**
(short, common, already everywhere), **Tanza** (clearable but semantically empty — hold as
the fallback if all eight fail).

### What to run, per name

1. Egyptian Trademark Office and WIPO Global Brand Database, **classes 9, 35, 42 and 43**.
2. App Store and Google Play name search in the **EG storefront**, plus SA and AE.
3. Domains: `.com`, `.app`, `.eg`, `.com.eg`.
4. Handles: Instagram, TikTok, X.
5. **A native-speaker read-aloud panel** — six to eight Egyptians, shown the Latin spelling
   only, asked to say it and then to say what it makes them think of. Karo and Korba are
   the proof that this step catches what no database will: a class connotation and a
   Turkish food word are both invisible to search and obvious to a person.

Expect attrition. Four surviving from eight would be a good outcome; two is workable;
if fewer, §10.1's four techniques generate more without starting over.

### Unchanged by this round

The approved brand direction carries forward untouched and is **not** contingent on the
name: electric cobalt `#3155FF` with its measured 5.42:1 white-on-primary, warm cream,
near-black, Alexandria-style bilingual typography, flat editorial surfaces, no gradients,
no glassmorphism, no purple, invisible AI. §7.0 remains the live specification, and every
replacement in §3 can proceed on its own schedule — the design work is not blocked on the
name, and should not wait for it.
