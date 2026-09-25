/**
 * A LOCAL SUPABASE-SHAPED STACK, for browser walks that must be real.
 *
 * Two walks need the same thing and disagree about everything else: a real
 * Postgres with every migration applied, a real PostgREST in front of it so
 * that RLS is genuinely in the loop, and — optionally — the real edge
 * functions. This is that thing, extracted so neither walk owns it.
 *
 * WHAT IS REAL: the database, the policies, the RPCs, the functions. Every
 * request the browser makes carries a signed JWT and Postgres switches to
 * `authenticated` with that `sub`, exactly as Supabase does. Nothing in a walk
 * can see a row its policy would not return.
 *
 * WHAT IS STOOD IN FOR: GoTrue. There is no auth server here, so the caller
 * mints session tokens and the proxy verifies them with the same secret
 * PostgREST uses. Signing in is not what these walks test, and a fake sign-in
 * producing a token nothing verified would have been the dishonest version.
 *
 * NOTHING HERE TOUCHES A HOSTED PROJECT. The database is dropped and rebuilt
 * on every run, and the JWT secret is regenerated per run so no credential
 * outlives the process.
 */
import { spawn, spawnSync } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..', '..');
const DAY = 24 * 60 * 60;

export function which(binary, override) {
  if (override && existsSync(override)) return override;
  const found = spawnSync('sh', ['-c', `command -v ${binary}`], { encoding: 'utf8' });
  return found.status === 0 ? found.stdout.trim() : null;
}

function run(command, args, options = {}) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, { cwd: ROOT, stdio: 'inherit', ...options });
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0 ? resolveRun() : reject(new Error(`${command} exited with ${code}`)),
    );
  });
}

async function waitFor(check, description, attempts = 120) {
  for (let index = 0; index < attempts; index += 1) {
    try {
      if (await check()) return;
    } catch {
      // Not up yet.
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`timed out waiting for ${description}`);
}

/**
 * Builds the database, starts PostgREST, the API proxy and any edge functions,
 * and hands back everything a walk needs to drive them.
 *
 * `fixtures` are applied in order after `db-local.sh`, each with
 * `akalt.local_fixture = 'yes'` set — which is the guard every fixture in this
 * repository checks before creating anything.
 */
export async function startLocalStack(options) {
  const {
    db,
    fixtures = [],
    functions = [],
    emails = {},
    pgrstPort = 3301,
    apiPort = 3310,
    firstFunctionPort = 3311,
  } = options;

  const PGHOST = process.env.PGHOST ?? '/tmp';
  const PGPORT = process.env.PGPORT ?? '55432';
  const PGUSER = process.env.PGUSER ?? 'postgres';

  const postgrest = which('postgrest', process.env.POSTGREST_BIN);
  if (!postgrest) {
    throw new Error(
      'postgrest is not on PATH. These walks drive the app through a REAL ' +
        'PostgREST so that RLS is genuinely in the loop; without it there is ' +
        'nothing honest to run. Install it, or set POSTGREST_BIN.',
    );
  }
  if (functions.length > 0 && !which('deno', process.env.DENO_BIN)) {
    throw new Error('deno is not on PATH, and this walk runs edge functions. Set DENO_BIN.');
  }

  const children = [];
  const servers = [];
  const background = (command, args, env) => {
    const child = spawn(command, args, { cwd: ROOT, stdio: 'ignore', env });
    children.push(child);
    return child;
  };

  /** One SQL statement, answered as trimmed text. Throws on a database error. */
  const sql = (statement) => {
    const result = spawnSync(
      'psql',
      ['-h', PGHOST, '-p', PGPORT, '-U', PGUSER, '-d', db, '-v', 'ON_ERROR_STOP=1', '-At', '-c', statement],
      { encoding: 'utf8' },
    );
    if (result.status !== 0) {
      throw new Error(`psql failed: ${(result.stderr || result.stdout || '').trim()}`);
    }
    return result.stdout.trim();
  };

  // --- 1. The database -------------------------------------------------------
  await run('./scripts/db-local.sh', [], {
    env: { ...process.env, PGHOST, PGPORT, PGUSER, DB: db },
    stdio: 'ignore',
  });

  for (const fixture of fixtures) {
    const applied = spawnSync(
      'psql',
      ['-h', PGHOST, '-p', PGPORT, '-U', PGUSER, '-d', db, '-v', 'ON_ERROR_STOP=1', '-q',
       '-c', "set akalt.local_fixture = 'yes'", '-f', fixture],
      { cwd: ROOT, encoding: 'utf8' },
    );
    // A fixture that failed silently is a walk that fails later for the wrong
    // reason, so this is loud.
    if (applied.status !== 0) {
      throw new Error(`fixture ${fixture} failed:\n${applied.stderr || applied.stdout}`);
    }
  }

  // --- 2. Tokens -------------------------------------------------------------
  const jwtSecret = `akalt-walk-${Math.random().toString(36).slice(2)}-${Date.now()}`;

  const sign = (claims) => {
    const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
    const head = encode({ alg: 'HS256', typ: 'JWT' });
    const body = encode(claims);
    const signature = createHmac('sha256', jwtSecret).update(`${head}.${body}`).digest('base64url');
    return `${head}.${body}.${signature}`;
  };

  const tokenFor = (role, sub) =>
    sign({
      role,
      ...(sub ? { sub, email: emails[sub] } : {}),
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + DAY,
    });

  const anonToken = tokenFor('anon');
  const serviceToken = tokenFor('service_role');

  /** Verifies a bearer token the same way PostgREST will. Not decoration. */
  const verify = (token) => {
    const parts = (token ?? '').split('.');
    if (parts.length !== 3) return null;
    const expected = createHmac('sha256', jwtSecret)
      .update(`${parts[0]}.${parts[1]}`)
      .digest('base64url');
    if (expected !== parts[2]) return null;
    const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    if (typeof claims.exp === 'number' && claims.exp * 1000 < Date.now()) return null;
    return claims;
  };

  const sessionFor = (userId) => {
    const now = Math.floor(Date.now() / 1000);
    return JSON.stringify({
      access_token: tokenFor('authenticated', userId),
      token_type: 'bearer',
      expires_in: DAY,
      expires_at: now + DAY,
      refresh_token: `walk-refresh-${userId}`,
      user: {
        id: userId,
        aud: 'authenticated',
        role: 'authenticated',
        email: emails[userId] ?? null,
        app_metadata: { provider: 'email' },
        user_metadata: {},
        created_at: new Date().toISOString(),
      },
    });
  };

  // --- 3. PostgREST ----------------------------------------------------------
  const config = join(tmpdir(), `akalt-${db}-postgrest.conf`);
  writeFileSync(
    config,
    [
      `db-uri = "postgres://${PGUSER}@/${db}?host=${PGHOST}&port=${PGPORT}"`,
      'db-schemas = "public"',
      'db-anon-role = "anon"',
      `jwt-secret = "${jwtSecret}"`,
      `server-port = ${pgrstPort}`,
      'server-host = "127.0.0.1"',
      '',
    ].join('\n'),
  );
  background(postgrest, [config], process.env);
  await waitFor(
    async () => (await fetch(`http://127.0.0.1:${pgrstPort}/delivery_areas?limit=1`)).ok,
    'postgrest',
  );

  // --- 4. Edge functions -----------------------------------------------------
  const apiBase = `http://127.0.0.1:${apiPort}`;
  const functionPorts = new Map();

  functions.forEach((name, index) => {
    const port = firstFunctionPort + index;
    functionPorts.set(name, port);

    /*
      `Deno.serve()` takes no port from the environment and every function
      calls it at module scope, so a wrapper swaps it for one that pins the
      port before importing the real entry point. The function's own code is
      untouched — this is the deployed file, running.
    */
    const entry = join(tmpdir(), `akalt-${db}-${name}.ts`);
    writeFileSync(
      entry,
      [
        `const original = Deno.serve;`,
        `// deno-lint-ignore no-explicit-any`,
        `(Deno as any).serve = (a: any, b?: any) =>`,
        `  typeof a === 'function'`,
        `    ? original({ port: ${port} }, a)`,
        `    : original({ ...a, port: ${port} }, b);`,
        `await import('${join(ROOT, 'supabase/functions', name, 'index.ts')}');`,
        '',
      ].join('\n'),
    );

    background(
      process.env.DENO_BIN ?? 'deno',
      [
        'run', '--quiet', '--allow-net', '--allow-env', '--allow-read',
        '--config', join(ROOT, 'supabase/functions', name, 'deno.json'),
        entry,
      ],
      {
        ...process.env,
        SUPABASE_URL: apiBase,
        SUPABASE_ANON_KEY: anonToken,
        SUPABASE_SERVICE_ROLE_KEY: serviceToken,
      },
    );
  });

  // --- 5. The one origin the browser talks to --------------------------------
  const cors = {
    'access-control-allow-origin': '*',
    'access-control-allow-headers':
      'authorization, apikey, content-type, x-client-info, x-application-name, prefer, accept-profile, content-profile, range',
    'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS, HEAD',
    'access-control-expose-headers': 'content-range, content-location',
  };

  const api = createServer(async (request, response) => {
    if (request.method === 'OPTIONS') {
      response.writeHead(204, cors);
      response.end();
      return;
    }

    const url = new URL(request.url ?? '/', apiBase);

    /*
      The ONE thing this answers itself. `payments-simulate` calls
      `auth.getUser()` and there is no GoTrue here — so the bearer token's
      signature is verified with the same secret PostgREST uses, and the user
      is then read out of Postgres. A forged token fails here exactly as it
      would fail there.
    */
    if (url.pathname === '/auth/v1/user') {
      const claims = verify((request.headers.authorization ?? '').replace(/^Bearer /i, ''));
      if (!claims?.sub) {
        response.writeHead(401, { ...cors, 'content-type': 'application/json' });
        response.end(JSON.stringify({ message: 'invalid token' }));
        return;
      }
      const email = sql(`select coalesce(email, '') from auth.users where id = '${claims.sub}'`);
      response.writeHead(200, { ...cors, 'content-type': 'application/json' });
      response.end(
        JSON.stringify({
          id: claims.sub,
          aud: 'authenticated',
          role: 'authenticated',
          email,
          app_metadata: {},
          user_metadata: {},
          created_at: new Date().toISOString(),
        }),
      );
      return;
    }

    let target = null;
    if (url.pathname.startsWith('/rest/v1/')) {
      target = `http://127.0.0.1:${pgrstPort}${url.pathname.slice('/rest/v1'.length)}${url.search}`;
    } else if (url.pathname.startsWith('/functions/v1/')) {
      const name = url.pathname.slice('/functions/v1/'.length);
      const port = functionPorts.get(name);
      if (port) target = `http://127.0.0.1:${port}/`;
    }

    if (!target) {
      response.writeHead(404, { ...cors, 'content-type': 'text/plain' });
      response.end('no route');
      return;
    }

    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = chunks.length > 0 ? Buffer.concat(chunks) : undefined;

    const headers = { ...request.headers };
    delete headers.host;
    delete headers['content-length'];
    delete headers.connection;

    try {
      const upstream = await fetch(target, { method: request.method, headers, body });
      const text = await upstream.text();
      const out = {
        ...cors,
        'content-type': upstream.headers.get('content-type') ?? 'application/json',
      };
      const range = upstream.headers.get('content-range');
      if (range) out['content-range'] = range;
      response.writeHead(upstream.status, out);
      response.end(text);
    } catch (error) {
      response.writeHead(502, { ...cors, 'content-type': 'text/plain' });
      response.end(String(error));
    }
  });

  servers.push(api);
  await new Promise((resolveServer, reject) => {
    api.once('error', reject);
    api.listen(apiPort, '127.0.0.1', resolveServer);
  });

  if (functions.length > 0) {
    await waitFor(
      async () => {
        for (const port of functionPorts.values()) {
          const probe = await fetch(`http://127.0.0.1:${port}/`, { method: 'OPTIONS' });
          if (probe.status >= 500) return false;
        }
        return true;
      },
      'the edge functions',
      480,
    );
  }

  return {
    apiBase,
    anonToken,
    serviceToken,
    tokenFor,
    sessionFor,
    sql,
    /** How supabase-js derives its storage key: `sb-<first host label>-auth-token`. */
    storageKey: `sb-${new URL(apiBase).hostname.split('.')[0]}-auth-token`,
    stop() {
      for (const child of children) {
        try {
          child.kill('SIGTERM');
        } catch {
          // Already gone.
        }
      }
      for (const server of servers) {
        try {
          server.close();
        } catch {
          // Already closed.
        }
      }
    },
  };
}
