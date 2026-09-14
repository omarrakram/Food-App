/**
 * No offset paging, anywhere, on anything that grows at the head.
 *
 *     npm run audit:pagination
 *
 * THE BUG THIS PREVENTS is the same one in two places. A thread grows at the
 * newest end while you scroll back through the oldest; a notification feed
 * grows while you read it. With `range(30, 59)` the window shifts under the
 * reader, so page two either repeats the last row of page one or skips the
 * first row it should have had — and the reader never sees the message that
 * was skipped, because nothing draws attention to a gap.
 *
 * STATIC RATHER THAN BEHAVIOURAL, on purpose. The failure only reproduces when
 * a row arrives between two fetches, which is rare in a test and constant in
 * production. Grepping for the call catches it before it can be written.
 *
 * It lives in `scripts/` rather than beside the code it audits because it
 * reads the filesystem, and the app's tsconfig deliberately cannot resolve
 * Node built-ins — app code must not reach for `fs`, and a test that did would
 * be the first exception to that.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FEATURES = join(ROOT, 'src/features');

const failures: string[] = [];

function check(condition: boolean, description: string, detail = ''): void {
  if (condition) {
    console.log(`  ok  ${description}${detail ? ` — ${detail}` : ''}`);
  } else {
    failures.push(`${description}${detail ? ` — ${detail}` : ''}`);
    console.log(`  FAIL ${description}${detail ? ` — ${detail}` : ''}`);
  }
}

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

console.log('\nPagination audit');

const files = sourceFiles(FEATURES);

// Guards against the walk silently matching nothing, which would make every
// assertion below vacuously true.
check(files.length > 20, 'the audit found the repositories it is auditing', `${files.length} files`);

const offenders = files
  .filter((path) => /\.range\s*\(/.test(readFileSync(path, 'utf8')))
  .map((path) => relative(ROOT, path));
check(offenders.length === 0, 'nothing pages with .range()', offenders.join(', '));

for (const repository of ['messages/supabase-repository.ts', 'recipes/supabase-repository.ts']) {
  const source = readFileSync(join(FEATURES, repository), 'utf8');
  check(/nextCursor/.test(source), `${repository} pages with a cursor`);
}

// A cursor of `created_at|id` seeking an index ordered only by `created_at` is
// not a total order: two rows sharing a timestamp make the page boundary
// ambiguous, and one of them is dropped.
const thread = readFileSync(join(FEATURES, 'messages/supabase-repository.ts'), 'utf8');
check(
  /order\('created_at'/.test(thread) && /order\('id'/.test(thread),
  'the thread query orders by every column in its cursor',
);

// An uncapped select on a thread is an accidental full-table read the first
// time somebody has a long conversation.
check(/\.limit\(/.test(thread), 'the thread query caps the page it asks for');

if (failures.length > 0) {
  console.error(`\nPagination audit FAILED: ${failures.length} problem(s)`);
  process.exit(1);
}
console.log('\nPagination audit passed');
