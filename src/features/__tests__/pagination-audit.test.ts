import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * No offset paging, anywhere, on anything that grows at the head.
 *
 * THE BUG THIS PREVENTS is the same one in two places. A thread grows at the
 * newest end while you scroll back through the oldest; a notification feed
 * grows while you read it. With `range(30, 59)` the window shifts under the
 * reader, so page two either repeats the last row of page one or skips the
 * first row it should have had — and the reader never sees the message that
 * was skipped, because nothing draws attention to a gap.
 *
 * It is a static check rather than a behavioural one on purpose. The failure
 * only reproduces when a row arrives between two fetches, which is rare in a
 * test and constant in production. Grepping for the call catches it before it
 * can be written.
 */

const FEATURES = join(__dirname, '..');

/** Every non-test source file under `src/features`. */
function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      return entry === '__tests__' ? [] : sourceFiles(path);
    }
    return /\.tsx?$/.test(entry) ? [path] : [];
  });
}

describe('pagination', () => {
  const files = sourceFiles(FEATURES);

  it('finds the repositories it is auditing', () => {
    // Guards against the walk silently matching nothing, which would make
    // every assertion below vacuously true.
    expect(files.length).toBeGreaterThan(20);
  });

  it('never pages with .range()', () => {
    const offenders = files.filter((path) => /\.range\s*\(/.test(readFileSync(path, 'utf8')));
    expect(offenders.map((path) => path.replace(FEATURES, ''))).toEqual([]);
  });

  it('pages every growing list with a cursor', () => {
    for (const repository of [
      'messages/supabase-repository.ts',
      'recipes/supabase-repository.ts',
    ]) {
      const source = readFileSync(join(FEATURES, repository), 'utf8');
      expect(source).toMatch(/nextCursor/);
    }
  });

  it('orders a keyset query by every column in its cursor', () => {
    // A cursor of `created_at|id` seeking against an index ordered only by
    // `created_at` is not a total order: two rows sharing a timestamp make
    // the page boundary ambiguous, and one of them is dropped.
    const source = readFileSync(join(FEATURES, 'messages/supabase-repository.ts'), 'utf8');
    expect(source).toMatch(/order\('created_at'/);
    expect(source).toMatch(/order\('id'/);
  });

  it('caps every page it asks for', () => {
    // An uncapped select on a thread is an accidental full-table read the
    // first time somebody has a long conversation.
    const source = readFileSync(join(FEATURES, 'messages/supabase-repository.ts'), 'utf8');
    expect(source).toMatch(/\.limit\(/);
  });
});
