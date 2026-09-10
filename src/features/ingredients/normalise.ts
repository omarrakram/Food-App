/**
 * Ingredient-name normalisation.
 *
 * Matching a user's "Tomatoes " against a recipe's "tomato" must be
 * deterministic and cheap — we do it hundreds of times per search, offline,
 * without involving the model. Everything here is pure and unit-tested.
 */

/** Arabic diacritics (harakat), superscript alef and tatweel carry no signal. */
const ARABIC_DIACRITICS = /[\u064b-\u0652\u0670\u0640]/g;

/** Latin combining marks left over after NFD decomposition. */
const LATIN_COMBINING = /[\u0300-\u036f]/g;

/**
 * Control characters, zero-width joiners and bidi overrides. These never belong
 * in an ingredient name and are exactly what a prompt-injection or homograph
 * attempt would hide payload in.
 */
const CONTROL_CHARS =
  /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028\u2029\u202a-\u202e\ufeff]/g;

/**
 * Words that describe preparation or packaging rather than identity. Removing
 * them lets "fresh chopped tomatoes" match "tomatoes".
 */
const NOISE_WORDS = new Set([
  'fresh',
  'frozen',
  'dried',
  'dry',
  'canned',
  'tinned',
  'raw',
  'cooked',
  'chopped',
  'sliced',
  'diced',
  'minced',
  'ground',
  'grated',
  'shredded',
  'peeled',
  'whole',
  'large',
  'small',
  'medium',
  'ripe',
  'organic',
  'boneless',
  'skinless',
  'a',
  'an',
  'the',
  'of',
  'some',
]);

/**
 * `ground beef` and `ground coriander` are distinct ingredients, so a few
 * "noise" words are protected when they lead a multi-word name.
 */
const PROTECTED_PREFIXES = new Set(['ground', 'green', 'red', 'white', 'black', 'sweet']);

function stripArabic(input: string): string {
  return input
    .replace(ARABIC_DIACRITICS, '')
    .replace(/[أإآٱ]/g, 'ا') // alef variants -> alef
    .replace(/ى/g, 'ي') // alef maqsura -> yeh
    .replace(/ؤ/g, 'و') // waw hamza -> waw
    .replace(/ئ/g, 'ي') // yeh hamza -> yeh
    .replace(/ة/g, 'ه'); // ta marbuta -> heh
}

/** Removes a naive English plural, keeping words that legitimately end in s. */
function singularise(word: string): string {
  if (word.length <= 3) return word;
  if (word.endsWith('ies') && word.length > 4) return `${word.slice(0, -3)}y`;
  if (word.endsWith('ses') || word.endsWith('xes') || word.endsWith('hes')) {
    return word.slice(0, -2);
  }
  if (word.endsWith('s') && !word.endsWith('ss') && !word.endsWith('us')) {
    return word.slice(0, -1);
  }
  return word;
}

/**
 * Canonical form used as a map key. Two ingredient strings that normalise to
 * the same value are treated as the same ingredient.
 */
export function normaliseIngredientName(raw: string): string {
  if (!raw) return '';

  const decomposed = raw.normalize('NFD').replace(LATIN_COMBINING, '');
  const cleaned = stripArabic(decomposed)
    .toLowerCase()
    // Keep letters, digits and spaces; everything else becomes a separator.
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) return '';

  const words = cleaned.split(' ');
  const kept = words.filter((word, index) => {
    if (index === 0 && PROTECTED_PREFIXES.has(word) && words.length > 1) return true;
    return !NOISE_WORDS.has(word);
  });

  const effective = kept.length > 0 ? kept : words;
  return effective.map(singularise).join(' ');
}

/**
 * Loose similarity for autocomplete ranking (never for matching decisions).
 * Returns 0–1: prefix matches beat substring matches beat token overlap.
 */
export function similarityScore(query: string, candidate: string): number {
  const q = normaliseIngredientName(query);
  const c = normaliseIngredientName(candidate);
  if (!q || !c) return 0;
  if (q === c) return 1;
  if (c.startsWith(q)) return 0.9 - Math.min(0.2, (c.length - q.length) / 100);
  if (c.includes(q)) return 0.7;

  const qTokens = new Set(q.split(' '));
  const cTokens = c.split(' ');
  const overlap = cTokens.filter((token) => qTokens.has(token)).length;
  if (overlap === 0) return 0;
  return 0.3 + 0.3 * (overlap / Math.max(qTokens.size, cTokens.length));
}

/**
 * Strips characters that could be read as instructions by the model.
 *
 * User-entered ingredient names flow into AI prompts, so they are untrusted
 * input: we drop control characters, neutralise the delimiter and role markers
 * a prompt-injection attempt relies on, and cap the length. The edge function
 * applies the same treatment server-side — this copy is defence in depth, not
 * the only line of defence. See ARCHITECTURE.md § Prompt injection.
 */
export function sanitiseForPrompt(raw: string, maxLength = 60): string {
  return raw
    .replace(CONTROL_CHARS, ' ')
    .replace(/[<>{}[\]`|\\]/g, ' ')
    .replace(/\b(system|assistant|human|user)\s*:/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}
