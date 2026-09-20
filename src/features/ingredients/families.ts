import { INGREDIENT_CATALOGUE, type CatalogueIngredient } from './catalogue.ts';
import { normaliseIngredientName } from './normalise.ts';

/**
 * Words that name a SET of ingredients rather than one.
 *
 * `chicken` forced this to exist. It is not a cut, so no row may own it, but
 * it is not meaningless either: "something without chicken" has an obvious
 * meaning and so does "a meal with chicken". Resolution cannot express that,
 * because resolution returns one ingredient and the honest answer is seven.
 *
 * TWO SOURCES, in this order of authority.
 *
 *   DECLARED    a curated entry: the words, in both languages, and the exact
 *               member slugs. Needed because the inferred rule below reads
 *               canonical NAMES, and Arabic does not name a family the way
 *               English does — `فراخ` appears in `صدور فراخ` and `أوراك فراخ`
 *               but not in `فرخة` (a whole bird) or `كوانس` (gizzards), so
 *               inference alone makes the Arabic word mean less than the
 *               English one. A user typing فراخ and a user typing chicken must
 *               get the same answer.
 *
 *   INFERRED    the HEAD NOUN of two or more canonical names. Cheap and
 *               self-maintaining: a seventh cheese joins the cheese family
 *               with nothing to update.
 *
 * WHY THE HEAD NOUN AND NOT ANY TOKEN. The first version of this took any
 * token shared by two names, and that made every ADJECTIVE a family: `green`
 * meant beans, lentils, onion and peas; `white` meant a cheese, a bean, a
 * pepper and an egg white; `hot` meant a hot dog or hot sauce. Those are not
 * meanings anyone asked for, and they were not theoretical — "green salad for
 * 4" became a hard requirement for one of five green things, and "white fish
 * dinner" required tilapia AND an egg white, which no recipe satisfies. A
 * modifier tells you WHICH one; only the head noun tells you WHAT KIND, and a
 * family is a kind.
 *
 * The head is the LAST token in English and the FIRST in Arabic, because the
 * two languages build a noun phrase from opposite ends: `white cheese` against
 * `جبنة بيضاء`, `chicken breast` against `صدور فراخ`. Getting this backwards
 * in either language reintroduces exactly the adjective families above.
 *
 * It costs the English `chicken` family — the head of `chicken breast` is
 * `breast` — which is precisely what the declared layer is for, and why
 * declaring it was needed for Arabic anyway.
 *
 * The rule remains a heuristic. `npm run audit:families` prints every family
 * it infers, and §9d of DATASET_EXPANSION_STRATEGY.md records which meanings
 * are intended, which are harmless, and which want a real parent/child model
 * rather than any rule read off a name.
 */

/** A curated family: what people call it, and what is in it. */
export type DeclaredFamily = {
  /** For reports and tests. Not user-facing. */
  readonly concept: string;
  /**
   * Every generic word meaning the whole set, in both languages.
   *
   * None of these may also be an alias of a single ingredient — a resolution
   * would win and the family would never be consulted. Asserted in the tests.
   */
  readonly terms: readonly string[];
  /** The catalogue slugs in the set. */
  readonly slugs: readonly string[];
  /**
   * The tokens that make a row a candidate member, used by the completeness
   * check in the tests: any catalogue row whose English or Arabic canonical
   * name contains one of these must be listed in `slugs` or the family is out
   * of date. Adding a chicken row therefore fails the suite until someone
   * decides whether it belongs, which is the point.
   */
  readonly memberTokens: readonly string[];
};

export const DECLARED_FAMILIES: readonly DeclaredFamily[] = [
  {
    concept: 'chicken',
    // `فراخ` is the PRIMARY Egyptian generic, and `firakh`/`farakh` are its two
    // realistic Franco spellings. `دجاج` is Modern Standard, supported because
    // an MSA speaker should not be stranded, and `dagag`/`dajaj` are SECONDARY
    // MSA transliterations rather than anything an Egyptian would type first.
    // Order here reflects that. See the native-review list in §9d.
    terms: ['chicken', 'فراخ', 'firakh', 'farakh', 'دجاج', 'dagag', 'dajaj'],
    slugs: [
      'chicken-breast',
      'chicken-thigh',
      'chicken-drumstick',
      'chicken-wings',
      'chicken-liver',
      'chicken-gizzards',
      'chicken-bones',
      'whole-chicken',
    ],
    memberTokens: ['chicken', 'فراخ', 'فرخه', 'كوانس'],
  },
];

const HAS_ARABIC = /[\u0600-\u06FF]/;

/**
 * The head noun of a name: the last token in English, the first in Arabic.
 *
 * `white cheese` -> `cheese`; `جبنة بيضاء` -> `جبنه`. A one-word name is its
 * own head.
 */
export function headNoun(name: string): string | null {
  const tokens = normaliseIngredientName(name)
    .split(' ')
    .filter((token) => token.length > 0);
  if (tokens.length === 0) return null;
  const head = HAS_ARABIC.test(name) ? tokens[0] : tokens[tokens.length - 1];
  return head !== undefined && head.length >= 3 ? head : null;
}

/**
 * Inferred families: head noun -> the ingredients it heads.
 *
 * Built from the English and Arabic canonical names only, never from aliases.
 * An alias is a nickname for one ingredient; letting nicknames vote would make
 * `sedr` a family word because it appears in `sedr firakh`.
 */
function buildInferredIndex(): Map<string, CatalogueIngredient[]> {
  const index = new Map<string, CatalogueIngredient[]>();
  for (const ingredient of INGREDIENT_CATALOGUE) {
    const heads = new Set(
      [ingredient.name, ingredient.nameAr]
        .map((value) => headNoun(value))
        .filter((head): head is string => head !== null),
    );
    for (const head of heads) {
      const bucket = index.get(head);
      if (bucket) bucket.push(ingredient);
      else index.set(head, [ingredient]);
    }
  }
  return index;
}

const INFERRED_INDEX = buildInferredIndex();

/**
 * The minimum members a token needs before it is a family.
 *
 * TWO, because a family of one is not a family — it is a spelling of a single
 * ingredient, and those belong in the alias column where they can be reviewed.
 * The implementation used to return one-item buckets, which quietly turned
 * every unaliased word of every canonical name into a match: `gizzards`
 * "covered" chicken gizzards, `casing` covered sausage casing. Harmless in
 * effect and wrong in kind, because it meant a family word and an alias did
 * the same job through two different mechanisms with two different review
 * paths.
 */
const MINIMUM_FAMILY_SIZE = 2;

/**
 * Head nouns that name a FORM, not a kind of food.
 *
 * The head-noun rule removed the adjectives, and these are what it could not:
 * `powder`, `cube` and `flake` are perfectly good head nouns, so `chili
 * powder`, `stock cube` and `corn flakes` really are headed by them. They are
 * just not a KIND of food. Nothing about being a powder makes baking powder,
 * cocoa and garlic powder interchangeable, and a family is a claim that its
 * members answer the same question.
 *
 * Left as families they answered the wrong one. `protein powder` required one
 * of six unrelated powders, `ice cubes` required beef or stock cubes, and `oat
 * flakes` required chili or corn flakes — none of which the catalogue has, all
 * of which it then insisted on.
 *
 * A deny list rather than a rule, because "is this word a form or a kind?" is
 * a judgement about food and not something a string can be asked. It is
 * deliberately short: a word earns a place here by being a head noun that
 * would otherwise mislead, and the tests assert every entry still names
 * something real so the list cannot rot into decoration.
 *
 * Not the same thing as an ambiguous WORD. `رومي` means roumy cheese, a
 * turkey and a bell pepper depending on who is speaking; that is lexical
 * ambiguity and it is handled by owning nothing — the word resolves to
 * nothing and search offers all three — not by denying a family it never had.
 */
const FORM_WORDS = new Set(['powder', 'cube', 'flake']);

/** Exposed so the tests can assert the list still names real head nouns. */
export function formWords(): readonly string[] {
  return [...FORM_WORDS];
}

/** Every inferred family, for the audit and the tests. Sorted, largest first. */
export function inferredFamilies(): { token: string; members: CatalogueIngredient[] }[] {
  return [...INFERRED_INDEX.entries()]
    .filter(([token, members]) => members.length >= MINIMUM_FAMILY_SIZE && !FORM_WORDS.has(token))
    .map(([token, members]) => ({ token, members }))
    .sort((a, b) => b.members.length - a.members.length || a.token.localeCompare(b.token));
}

const BY_SLUG = new Map(INGREDIENT_CATALOGUE.map((ingredient) => [ingredient.slug, ingredient]));

const DECLARED_BY_TERM = new Map<string, DeclaredFamily>(
  DECLARED_FAMILIES.flatMap((family) =>
    family.terms.map((term) => [normaliseIngredientName(term), family] as const),
  ),
);

/** The members of a declared family, resolved to catalogue entries. */
export function declaredFamilyMembers(family: DeclaredFamily): CatalogueIngredient[] {
  return family.slugs
    .map((slug) => BY_SLUG.get(slug))
    .filter((ingredient): ingredient is CatalogueIngredient => ingredient !== undefined);
}

/**
 * The family a term names, or an empty list.
 *
 * Declared beats inferred: `فراخ` is in both, and only the declared entry
 * reaches the whole bird and the gizzards.
 *
 * Callers must check resolution FIRST — one exact answer always beats a
 * family, so `milk` stays milk rather than becoming every milk in the shop.
 * `matching.ts` owns that ordering because it owns the alias index.
 */
export function familyFor(normalisedTerm: string): CatalogueIngredient[] {
  const declared = DECLARED_BY_TERM.get(normalisedTerm);
  if (declared) return declaredFamilyMembers(declared);

  // A phrase is never an inferred family: the rule is about single words.
  if (normalisedTerm.includes(' ')) return [];

  if (FORM_WORDS.has(normalisedTerm)) return [];

  const inferred = INFERRED_INDEX.get(normalisedTerm) ?? [];
  return inferred.length >= MINIMUM_FAMILY_SIZE ? [...inferred] : [];
}
