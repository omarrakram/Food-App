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
    // Everything in this directory is arithmetic and rules over plain values,
    // so it runs identically on the client, inside an edge function and in the
    // merchant dashboard. A React import here would quietly make one of those
    // three impossible.
    const offenders: string[] = [];

    for (const file of sourceFilesIn('src/features/commerce')) {
      if (file.includes('__tests__')) continue;
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
