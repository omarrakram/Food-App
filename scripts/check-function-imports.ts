/**
 * Every bare specifier an Edge Function can reach must be mapped, in the file
 * the DEPLOY actually reads.
 *
 * THE BUG THIS EXISTS FOR: a hosted deploy of both functions failed with
 *
 *   Relative import path "zod" not prefixed with / or ./ or ../
 *   at src/features/ai/schema.ts:1
 *
 * The mapping existed — in `supabase/functions/deno.json`. The local `deno`
 * CLI finds that by walking up from the entry point, so `npm run fn:check`
 * passed and CI was green. The hosted bundler resolves configuration from the
 * FUNCTION'S OWN directory, where there was none, so every bare specifier in
 * the graph arrived unmapped. `zod` was the first one reported;
 * `@anthropic-ai/sdk` and `@supabase/supabase-js` were equally unresolvable.
 *
 * Nothing in the repository could see that gap: the app's tests never load
 * these modules, and the one command that did type-check them was being handed
 * the config by hand. This closes it by reading the graph the way the deploy
 * does — from the function directory, with only that directory's config.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const FUNCTIONS_DIR = join(ROOT, 'supabase', 'functions');
/**
 * Discovered, not listed.
 *
 * This was a hand-maintained array, which meant a new function was silently
 * exempt from the very check that exists to stop a deploy failing on an
 * unresolved import. Reading the directory is the same amount of code and
 * cannot fall behind.
 */
const FUNCTIONS = readdirSync(FUNCTIONS_DIR, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && !entry.name.startsWith('_'))
  .map((entry) => entry.name)
  .filter((name) => existsSync(join(FUNCTIONS_DIR, name, 'index.ts')))
  .sort();

const problems: string[] = [];
const note = (message: string) => problems.push(message);

/** A specifier the Deno runtime resolves without an import map. */
function isPrefixed(specifier: string): boolean {
  return /^(\.|\/|node:|npm:|jsr:|https:|data:)/.test(specifier);
}

/**
 * Import specifiers in a module.
 *
 * Comments are stripped first. Without that, a sentence that happens to
 * contain `from '…'` is read as an import — which it is not, and a checker
 * that reports prose is a checker people learn to ignore.
 */
function specifiersOf(source: string): string[] {
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

  const found: string[] = [];
  const patterns = [
    /(?:^|\n)\s*(?:import|export)\b[\s\S]*?\bfrom\s*['"]([^'"]+)['"]/g,
    /(?:^|\n)\s*import\s*['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(code)) !== null) found.push(match[1]!);
  }
  return found;
}

/** Follows relative imports, collecting every bare specifier on the way. */
function walk(entry: string): Map<string, Set<string>> {
  const bare = new Map<string, Set<string>>();
  const seen = new Set<string>();

  const visit = (file: string) => {
    if (seen.has(file)) return;
    seen.add(file);
    if (!existsSync(file)) {
      note(`${relative(ROOT, file)} is imported but does not exist`);
      return;
    }
    for (const specifier of specifiersOf(readFileSync(file, 'utf8'))) {
      if (specifier.startsWith('.') || specifier.startsWith('/')) {
        visit(resolve(dirname(file), specifier));
      } else if (!isPrefixed(specifier)) {
        if (!bare.has(specifier)) bare.set(specifier, new Set());
        bare.get(specifier)!.add(relative(ROOT, file));
      }
    }
  };

  visit(entry);
  return bare;
}

function readImports(configPath: string): Record<string, string> | null {
  if (!existsSync(configPath)) return null;
  // Deno accepts comments in `deno.json`; JSON.parse does not.
  const text = readFileSync(configPath, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
  return (JSON.parse(text) as { imports?: Record<string, string> }).imports ?? {};
}

const shared = readImports(join(FUNCTIONS_DIR, 'deno.json'));
if (shared === null) note('supabase/functions/deno.json is missing');

for (const name of FUNCTIONS) {
  const dir = join(FUNCTIONS_DIR, name);
  const configPath = join(dir, 'deno.json');
  const imports = readImports(configPath);

  if (imports === null) {
    note(
      `supabase/functions/${name}/deno.json is missing — the hosted bundler ` +
        'reads the function directory, not the shared config, so every bare ' +
        'specifier would fail to resolve on deploy',
    );
    continue;
  }

  // Every bare specifier the function can reach, mapped in ITS OWN config.
  for (const [specifier, importers] of walk(join(dir, 'index.ts'))) {
    if (!(specifier in imports)) {
      note(
        `${name}: "${specifier}" has no mapping in supabase/functions/${name}/deno.json ` +
          `(imported by ${[...importers].join(', ')})`,
      );
    }
  }

  // Exact pins, so a deploy cannot silently pick up a different version from
  // the one the lockfile resolved.
  for (const [specifier, target] of Object.entries(imports)) {
    if (/[\^~]|@latest$/.test(target) || !/@\d+\.\d+\.\d+/.test(target)) {
      note(`${name}: "${specifier}" is not pinned to an exact version (${target})`);
    }
  }

  // And no drift between the three files.
  if (shared !== null && JSON.stringify(imports) !== JSON.stringify(shared)) {
    note(
      `${name}: its imports differ from supabase/functions/deno.json — ` +
        'the config the deploy reads and the one the tests read must agree, ' +
        'or a passing check proves nothing about a deploy',
    );
  }
}

if (problems.length > 0) {
  console.error('Edge function imports are not deploy-safe:\n');
  for (const problem of problems) console.error(`  ✗ ${problem}`);
  process.exit(1);
}

console.log(
  `Edge function imports are deploy-safe: ${FUNCTIONS.length} functions, ` +
    `each with its own pinned deno.json covering every reachable bare specifier.`,
);
