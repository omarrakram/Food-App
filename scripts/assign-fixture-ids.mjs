/**
 * One-time (idempotent) rewrite of the recipe fixture ids into deterministic
 * UUIDv5 values, so a fixture recipe and its seeded database row share an id.
 *
 * Run:  node scripts/assign-fixture-ids.mjs
 * Safe to re-run: ids that are already uuids are left alone.
 */
import { readFileSync, writeFileSync } from 'node:fs';

import { UUID_RE, uuidv5 } from './uuid.mjs';

const target = new URL('../src/features/recipes/fixtures.ts', import.meta.url);
const source = readFileSync(target, 'utf8');

let replaced = 0;
const rewritten = source.replace(/(\bid: ')([^']+)(')/g, (match, prefix, id, suffix) => {
  if (UUID_RE.test(id)) return match;
  replaced += 1;
  return `${prefix}${uuidv5(id)}${suffix}`;
});

if (replaced === 0) {
  console.log('fixture ids already assigned; nothing to do');
} else {
  writeFileSync(target, rewritten);
  console.log(`assigned ${replaced} deterministic uuids`);
}
