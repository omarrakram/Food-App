import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * THE DEPENDENCY POINTS ONE WAY.
 *
 * Food intelligence — recipes, pantry, ingredients, pricing — must never
 * import commerce. Commerce may import food intelligence freely.
 *
 * This is not tidiness. It is the only thing standing between AKALT having a
 * licensable product and AKALT having one supermarket's ordering app. If
 * `features/recipes` ever reaches for a cart, a SKU or an order, then shipping
 * the food intelligence into Breadfast's or Rabbit's checkout stops being a
 * configuration change and becomes a rewrite — and that option is worth more
 * than any individual feature it would buy.
 *
 * The violation is always small and always reasonable-looking at the time:
 * one import of `MerchantProduct` into the recipe screen's engine because the
 * price was right there. This test is what makes that a deliberate decision
 * rather than an afternoon's convenience.
 */

const ROOT = join(__dirname, '..', '..');

/** Everything downstream of these must stay ignorant of commerce. */
const FOOD_INTELLIGENCE_DIRS = [
  'src/features/recipes',
  'src/features/ingredients',
  'src/features/pantry',
  'src/features/pricing',
];

/** Directories a `features/**` module may never import from at all. */
const FORBIDDEN_FOR_FEATURES = ['@/components', '@/app'];

function sourceFilesIn(dir: string): string[] {
  const absolute = join(ROOT, dir);
  const out: string[] = [];

  const walk = (current: string): void => {
    for (const entry of readdirSync(current)) {
      const path = join(current, entry);
      if (statSync(path).isDirectory()) {
        walk(path);
        continue;
      }
      if (!/\.tsx?$/.test(entry)) continue;
      out.push(path);
    }
  };

  walk(absolute);
  return out;
}

function importsIn(file: string): string[] {
  const source = readFileSync(file, 'utf8');
  const specifiers: string[] = [];
  // Covers `import x from 'y'`, `import type { x } from 'y'` and
  // `export … from 'y'`. Dynamic `import('y')` is caught by the second.
  const patterns = [/from\s+['"]([^'"]+)['"]/g, /import\(\s*['"]([^'"]+)['"]\s*\)/g];

  for (const pattern of patterns) {
    let match = pattern.exec(source);
    while (match !== null) {
      if (match[1]) specifiers.push(match[1]);
      match = pattern.exec(source);
    }
  }
  return specifiers;
}

describe('food intelligence does not know commerce exists', () => {
  it.each(FOOD_INTELLIGENCE_DIRS)('%s imports nothing from commerce', (dir) => {
    const offenders: string[] = [];

    for (const file of sourceFilesIn(dir)) {
      for (const specifier of importsIn(file)) {
        const reachesCommerce =
          specifier.startsWith('@/features/commerce') ||
          specifier === '@/types/commerce' ||
          specifier.includes('/commerce/');
        if (reachesCommerce) {
          offenders.push(`${file.replace(ROOT, '')} -> ${specifier}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});

describe('commerce obeys the same layering rule as every other feature', () => {
  it('imports no component and no route', () => {
    const offenders: string[] = [];

    for (const file of sourceFilesIn('src/features/commerce')) {
      for (const specifier of importsIn(file)) {
        if (FORBIDDEN_FOR_FEATURES.some((prefix) => specifier.startsWith(prefix))) {
          offenders.push(`${file.replace(ROOT, '')} -> ${specifier}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it('keeps the engines free of React', () => {
    // The ranking, the pack arithmetic, the ledger and the state machines are
    // rules over plain values, so they run identically on the client, inside
    // an edge function and in the merchant dashboard. A React import in any of
    // them quietly makes two of those three impossible.
    //
    // `hooks.ts` is exempt BY NAME, and only it. Binding the engines to the
    // cache and to the user's preferences is what that file is for, and every
    // other feature in this codebase has the same file for the same reason.
    // Exempting by name rather than by a pattern means the next module that
    // wants React has to argue for itself here.
    const BINDING_LAYER = 'hooks.ts';
    const offenders: string[] = [];

    for (const file of sourceFilesIn('src/features/commerce')) {
      if (file.includes('__tests__')) continue;
      if (file.endsWith(BINDING_LAYER)) continue;
      for (const specifier of importsIn(file)) {
        if (specifier === 'react' || specifier === 'react-native') {
          offenders.push(`${file.replace(ROOT, '')} -> ${specifier}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});

describe('the commerce type module stays a leaf', () => {
  it('imports only from the domain types beside it', () => {
    // `src/types/**` is the bottom of the layering table: it may not reach
    // upward into features. Commerce types referencing `Money` and `Unit` is
    // fine; commerce types reaching for a repository is not.
    const specifiers = importsIn(join(ROOT, 'src/types/commerce.ts'));
    expect(specifiers).toEqual(['./domain']);
  });
});

/**
 * MERCHANT TEXT REACHES THE SCREEN THROUGH ONE DOOR.
 *
 * `features/commerce/display.ts` is where a merchant's own words become the
 * app's words. It is the only place that knows both rules at once: show the
 * trade name the merchant published, and render its digits 0–9 like the rest
 * of the app. A screen that reaches for `product.name` directly skips both —
 * it shows the English name to an Arabic reader AND puts «١ كجم» next to
 * «2 عبوات» — and that is exactly how it was already wrong once.
 *
 * So no component or screen may read those fields itself. The rule is checked
 * by grep rather than by types because the fields are legitimately public:
 * `sourcing.ts` compares names, the importer writes them, and tests assert on
 * the stored value on purpose. It is the RENDERING that has one door.
 */
describe('nothing renders a merchant name except the display layer', () => {
  const UI_DIRS = ['src/components/commerce', 'src/app'];

  /** `product.name`, `merchant.nameAr`, `location.name`… in UI code. */
  const DIRECT_READ =
    /\b(?:product|merchant|location|chosen\.product)\s*\.\s*(?:name|nameAr|brand)\b/;

  it('reads merchant text through display.ts, never off the row', () => {
    const offenders: string[] = [];

    for (const dir of UI_DIRS) {
      for (const file of sourceFilesIn(dir)) {
        if (file.includes('__tests__')) continue;
        const source = readFileSync(file, 'utf8');
        // Only files that touch commerce at all; `recipe.name` and the like
        // are a different vocabulary with no merchant behind them.
        if (!/@\/features\/commerce|@\/types\/commerce/.test(source)) continue;

        source.split('\n').forEach((line, index) => {
          if (!DIRECT_READ.test(line)) return;
          // The display layer is imported and called BY these files; a call
          // like `productDisplayName(chosen.product, language)` is the fix,
          // not the violation.
          if (/DisplayName\s*\(/.test(line)) return;
          offenders.push(`${file.replace(ROOT, '')}:${index + 1} ${line.trim()}`);
        });
      }
    }

    expect(offenders).toEqual([]);
  });
});
