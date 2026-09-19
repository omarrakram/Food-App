/**
 * A many-of-a-kind testID must not share a prefix with a named control.
 *
 * THE BUG THIS EXISTS FOR, because it cost a revert and was invisible for
 * months. Discover's recipe cards were `discover-<uuid>`, in the same
 * namespace as `discover-open-drawer`, `discover-empty` and
 * `discover-load-more`. A Playwright prefix selector for `discover-`
 * therefore matched the DRAWER BUTTON first — the header comes earlier in the
 * DOM than any card.
 *
 * Nothing failed. The browser walk's Arabic pass clicked that button, opened
 * the drawer, and then audited the drawer's contents while reporting on "the
 * Arabic recipe page". It was green for the wrong reason, and the only
 * visible symptom was a drawer hanging open in every archived Arabic
 * screenshot. When a document-direction change later moved that button, the
 * step finally timed out — and the failure was misread as a hit-testing
 * problem, so a correct change was reverted for it.
 *
 * A prefix collision is not a style question. It silently redirects every
 * `^=` selector written against the shorter name, and the test it breaks
 * keeps passing.
 *
 * SCOPED DELIBERATELY. Only TEMPLATE ids — `` testID={`x-${id}`} ``, the ones
 * that identify one of many and are therefore the ones anybody selects by
 * prefix — are checked. A literal pair like `pantry-editor` and
 * `pantry-editor-submit` is a container and its child: a prefix match there
 * returns the container, which is what a reader expects. A template that
 * swallows a named control returns the CONTROL, which is not.
 *
 *     npm run audit:testids
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const SRC = join(ROOT, 'src');

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      if (entry === '__tests__' || entry === '__mocks__' || entry === 'node_modules') continue;
      out.push(...sourceFiles(path));
    } else if (extname(path) === '.tsx') {
      out.push(path);
    }
  }
  return out;
}

/**
 * Every testID a file assigns.
 *
 * A literal (`testID="pantry-add"`) is taken whole. A template
 * (`` testID={`discover-recipe-${id}`} ``) is taken up to its first
 * interpolation, because that leading text is exactly what a `^=` selector
 * matches on.
 */
type Found = { id: string; manyOfAKind: boolean };

function testIDs(source: string): Found[] {
  const found = new Map<string, Found>();
  for (const match of source.matchAll(/testID=(?:"([^"]+)"|\{`([^`$]*)\$?)/g)) {
    const literal = match[1];
    const template = match[2];
    const id = literal ?? template;
    if (!id) continue;
    found.set(id, { id, manyOfAKind: literal === undefined });
  }
  return [...found.values()];
}

type Collision = { file: string; shorter: string; longer: string };

const collisions: Collision[] = [];
let scanned = 0;
let ids = 0;

for (const file of sourceFiles(SRC)) {
  const found = testIDs(readFileSync(file, 'utf8'));
  if (found.length === 0) continue;
  scanned += 1;
  ids += found.length;
  for (const a of found) {
    for (const b of found) {
      if (a.id === b.id) continue;
      // Only a many-of-a-kind id on either side of the overlap is a hazard.
      if (!a.manyOfAKind && !b.manyOfAKind) continue;
      if (b.id.startsWith(a.id)) {
        collisions.push({ file: relative(ROOT, file), shorter: a.id, longer: b.id });
      }
    }
  }
}

if (collisions.length > 0) {
  console.error(`\n✗ ${collisions.length} testID prefix collision(s):\n`);
  for (const { file, shorter, longer } of collisions) {
    console.error(`  ${file}`);
    console.error(`    "${shorter}" swallows "${longer}"`);
    console.error(`    a [data-testid^="${shorter}"] selector reaches "${longer}" too.\n`);
  }
  console.error('Give the many-of-a-kind id a namespace of its own, e.g.');
  console.error('`discover-recipe-${id}` beside `discover-open-drawer`.\n');
  process.exit(1);
}

console.log(`testIDs are unambiguous: ${ids} ids across ${scanned} files, no prefix collisions.`);
