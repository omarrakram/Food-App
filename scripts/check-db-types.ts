/**
 * Checks `database.types.ts` against the migrations that define the schema.
 *
 *     npm run db:types:check
 *
 * Background: these types are hand-maintained. Generating them needs Docker
 * (`supabase gen types`), which is not available everywhere this repo is
 * worked on, and the generator's output format also drifts between CLI
 * versions — so a byte comparison fails on things that are not drift at all,
 * and a check that cries wolf gets switched off the first time it blocks a
 * release.
 *
 * So this compares the two things that actually matter against the SQL itself:
 * every table and column a migration creates, and every value an enum admits.
 * A renamed column type-checks perfectly and fails at runtime, which is exactly
 * the class of bug this exists to catch — and checking the migrations catches
 * it at the source, without a database or a container.
 *
 * `npm run db:types:from-url` remains the way to regenerate properly once a
 * Docker host or a Supabase project is available.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MIGRATIONS = join(ROOT, 'supabase/migrations');
const TYPES = join(ROOT, 'src/lib/supabase/database.types.ts');

/** Columns a migration never declares but Postgres or a trigger provides. */
const IMPLICIT_COLUMNS = new Set(['id', 'created_at', 'updated_at']);

const APP_SOURCE = join(ROOT, 'src');

/**
 * Tables the client actually reads or writes.
 *
 * `database.types.ts` deliberately describes the app's surface rather than the
 * whole schema — reference data like `ingredients` is bundled and matched
 * offline, and the grocery tables exist for an integration that has no code
 * yet. Rather than keep a hand-written allow-list of those exemptions, which
 * would rot the moment someone wrote the first query, this reads the queries
 * themselves: a table the client touches must be typed, and one it does not
 * need not be.
 */
function tablesQueriedByClient(): Set<string> {
  const found = new Set<string>();

  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(path);
        continue;
      }
      if (!/\.tsx?$/.test(entry.name)) continue;
      const source = readFileSync(path, 'utf8');
      for (const match of source.matchAll(/\.from\(\s*['"`](\w+)['"`]\s*\)/g)) {
        found.add(match[1]!);
      }
    }
  };

  walk(APP_SOURCE);
  return found;
}

function readMigrations(): string {
  return readdirSync(MIGRATIONS)
    .filter((file) => file.endsWith('.sql'))
    .sort()
    .map((file) => readFileSync(join(MIGRATIONS, file), 'utf8'))
    .join('\n');
}

/** Strips comments so a commented-out column is not read as a real one. */
function stripComments(sql: string): string {
  return sql.replace(/--[^\n]*/g, '');
}

function tablesFromSql(sql: string): Map<string, Set<string>> {
  const tables = new Map<string, Set<string>>();
  const pattern = /create table (?:if not exists )?public\.(\w+)\s*\(([\s\S]*?)\n\);/g;

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(sql)) !== null) {
    const columns = new Set<string>();
    for (const line of match[2]!.split('\n')) {
      const trimmed = line.trim();
      // Skip table-level constraints; they are not columns.
      if (/^(primary key|foreign key|unique|constraint|check|exclude)\b/i.test(trimmed)) continue;
      const column = /^(\w+)\s+[a-z]/i.exec(trimmed);
      if (column) columns.add(column[1]!);
    }
    if (columns.size > 0) tables.set(match[1]!, columns);
  }

  // Views are relations the client queries exactly like tables, so they have
  // to be in this map or a real view reads as a missing table. Their columns
  // are aliased expressions rather than declarations, so only the NAME is
  // recorded — the column-level check below skips a relation with no columns.
  const views = /create (?:or replace )?view public\.(\w+)\b/gi;
  while ((match = views.exec(sql)) !== null) {
    if (!tables.has(match[1]!)) tables.set(match[1]!, new Set());
  }

  // `alter table ... add column` counts too.
  const added = /alter table (?:if exists )?public\.(\w+)\s+add column (?:if not exists )?(\w+)/gi;
  while ((match = added.exec(sql)) !== null) {
    tables.get(match[1]!)?.add(match[2]!);
  }

  // A RENAME IS THE DRIFT THIS FILE EXISTS FOR — the docblock says so: a
  // renamed column type-checks perfectly and fails at runtime. Without this
  // the old name is still expected and the new one is never required, which
  // is precisely backwards.
  const renamed =
    /alter table (?:if exists )?public\.(\w+)\s+rename column (\w+)\s+to\s+(\w+)/gi;
  while ((match = renamed.exec(sql)) !== null) {
    const columns = tables.get(match[1]!);
    if (!columns) continue;
    columns.delete(match[2]!);
    columns.add(match[3]!);
  }

  const dropped = /alter table (?:if exists )?public\.(\w+)\s+drop column (?:if exists )?(\w+)/gi;
  while ((match = dropped.exec(sql)) !== null) {
    tables.get(match[1]!)?.delete(match[2]!);
  }

  return tables;
}

function enumsFromSql(sql: string): Map<string, string[]> {
  const enums = new Map<string, string[]>();
  const pattern = /create type public\.(\w+) as enum\s*\(([\s\S]*?)\);/g;

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(sql)) !== null) {
    const values = [...match[2]!.matchAll(/'([^']+)'/g)].map((value) => value[1]!);
    enums.set(match[1]!, values.sort());
  }

  // Values added after the fact.
  const added = /alter type public\.(\w+) add value (?:if not exists )?'([^']+)'/gi;
  while ((match = added.exec(sql)) !== null) {
    const existing = enums.get(match[1]!);
    if (existing && !existing.includes(match[2]!)) {
      enums.set(match[1]!, [...existing, match[2]!].sort());
    }
  }

  return enums;
}

/** Every identifier the types file mentions, which is all we need to match on. */
function typeFileTokens(source: string): Set<string> {
  return new Set(source.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? []);
}

/**
 * TypeScript comments, removed.
 *
 * Literals are found by pairing quotes, and prose contains apostrophes. One
 * "the order's answer" in a docblock shifts every pair after it by one, so an
 * enum further down the file reads as absent and the check fails for a reason
 * that has nothing to do with the schema. Comments are stripped for the same
 * reason the SQL side strips them: a comment is not code.
 */
function stripTsComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

/** String literals in the types file, for checking enum values. */
function typeFileLiterals(source: string): Set<string> {
  return new Set(
    [...stripTsComments(source).matchAll(/'([^']*)'/g)].map((match) => match[1]!),
  );
}

/** `dietary_preference` -> `DietaryPreference`, how the types name their enums. */
function toPascalCase(value: string): string {
  return value.replace(/(^|_)(\w)/g, (_match, _underscore, letter: string) => letter.toUpperCase());
}

function main(): void {
  const sql = stripComments(readMigrations());
  const source = readFileSync(TYPES, 'utf8');

  const tables = tablesFromSql(sql);
  const enums = enumsFromSql(sql);
  const tokens = typeFileTokens(source);
  const literals = typeFileLiterals(source);

  const problems: string[] = [];
  const queried = tablesQueriedByClient();

  // 1. Anything the client queries has to exist, and has to be typed.
  for (const table of queried) {
    if (!tables.has(table)) {
      problems.push(`the client queries "${table}", which no migration creates`);
    } else if (!tokens.has(table)) {
      problems.push(`the client queries "${table}", which database.types.ts does not describe`);
    }
  }

  // 2. Every typed table has to still exist, with every column it declares.
  for (const [table, columns] of tables) {
    if (!tokens.has(table)) continue; // Not part of the app's surface.
    for (const column of columns) {
      // Implicit columns are covered by shared row helpers rather than named
      // individually, so their absence is not drift.
      if (IMPLICIT_COLUMNS.has(column)) continue;
      if (!tokens.has(column)) {
        problems.push(`${table}.${column} is in the migrations but not in the types`);
      }
    }
  }

  // 3. An enum the types name must list every value the database admits — a
  //    missing one is a value the app can receive and has no case for.
  for (const [name, values] of enums) {
    if (!tokens.has(name) && !tokens.has(toPascalCase(name))) continue;
    for (const value of values) {
      if (!literals.has(value)) {
        problems.push(`enum ${name} has value "${value}", which the types do not list`);
      }
    }
  }

  if (problems.length > 0) {
    console.error(
      `database.types.ts is out of step with supabase/migrations (${problems.length}):\n` +
        problems.map((problem) => `  - ${problem}`).join('\n') +
        '\n\nUpdate the types, or regenerate with `npm run db:types:from-url`.',
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    `database.types.ts is in step with the migrations: ` +
      `${queried.size} tables queried by the app, ${tables.size} in the schema, ` +
      `${enums.size} enums.`,
  );
}

main();
