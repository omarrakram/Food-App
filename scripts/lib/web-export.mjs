/**
 * Serving an Expo web export, and finding a browser to drive it with.
 *
 * Extracted because there are now TWO browser walks — `smoke:web`, which drives
 * the app in demo mode with no backend, and `walk:merchant`, which drives it
 * against a real Postgres through a real PostgREST. They disagree about almost
 * everything else and agree exactly here: how a static export maps to URLs, and
 * where Playwright's Chromium is.
 *
 * Keeping one copy matters more than it looks. `resolveExportPath` encodes how
 * Expo writes dynamic routes, and a second copy of that logic would drift the
 * first time a route shape changed — leaving one walk silently serving 404s
 * that read as an application failure.
 */
import { createReadStream } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { extname, join } from 'node:path';

export const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
  '.map': 'application/json; charset=utf-8',
};

/** Locates Playwright without making it a dependency of the app. */
export async function loadChromium(root) {
  const candidates = [
    process.env.PLAYWRIGHT_CORE,
    'playwright-core',
    'playwright',
    join(root, 'node_modules/playwright-core/index.mjs'),
    join(root, '../node_modules/playwright-core/index.mjs'),
  ].filter(Boolean);

  const require_ = createRequire(import.meta.url);
  for (const candidate of candidates) {
    try {
      const specifier = candidate.startsWith('/')
        ? candidate
        : require_.resolve(candidate, { paths: [root] });
      const mod = await import(specifier);
      if (mod.chromium) return mod.chromium;
      if (mod.default?.chromium) return mod.default.chromium;
    } catch {
      // Try the next candidate.
    }
  }
  throw new Error(
    'Playwright not found. Install it with `npm i -D playwright-core` (and ' +
      '`npx playwright install chromium`), or point PLAYWRIGHT_CORE at an ' +
      'existing playwright-core entry point.',
  );
}

/**
 * Resolves a URL path against the export, dynamic routes included.
 *
 * Expo writes a dynamic route as a literal `[id].html`, so `/recipe/<uuid>`
 * matches no file and a naive server 404s it — which silently made every
 * direct link to a recipe untestable, including the share links this app
 * sends. Walking the path and falling back to the single `[param]` sibling at
 * each level is what the real router does, and it is what a shared link needs.
 */
export async function resolveExportPath(dist, pathname) {
  const segments = decodeURIComponent(pathname).split('/').filter(Boolean);

  const isFile = async (candidate) => {
    try {
      return (await stat(candidate)).isFile();
    } catch {
      return false;
    }
  };
  const isDirectory = async (candidate) => {
    try {
      return (await stat(candidate)).isDirectory();
    } catch {
      return false;
    }
  };
  /**
   * The one dynamic segment in a directory, by PARAM NAME.
   *
   * Expo writes `[id]` and `[id].html` side by side — a directory for the
   * route's children and a file for the route itself. Those are ONE route, so
   * counting entries says "ambiguous" and refuses to resolve anything. Only
   * two different names — `[id]` and `[slug]` — would be a real ambiguity, and
   * guessing there would make the walk pass against the wrong page.
   */
  const dynamicChild = async (directory) => {
    try {
      const entries = await readdir(directory);
      const names = new Set();
      for (const entry of entries) {
        const match = /^(\[[^\]]+\])(\.html)?$/.exec(entry);
        if (match) names.add(match[1]);
      }
      const [only] = [...names];
      return names.size === 1 ? only : null;
    } catch {
      return null;
    }
  };

  let current = dist;
  for (const [index, segment] of segments.entries()) {
    const last = index === segments.length - 1;
    const literal = join(current, segment);

    if (last) {
      if (await isFile(literal)) return literal;
      if (await isFile(`${literal}.html`)) return `${literal}.html`;
      if (await isFile(join(literal, 'index.html'))) return join(literal, 'index.html');
      const dynamic = await dynamicChild(current);
      if (dynamic) {
        const resolved = join(current, dynamic);
        // `.html` first: that IS the route. The same-named directory beside it
        // holds the route's children, not the route.
        if (await isFile(`${resolved}.html`)) return `${resolved}.html`;
        if (await isFile(resolved)) return resolved;
        if (await isFile(join(resolved, 'index.html'))) return join(resolved, 'index.html');
      }
      return null;
    }

    if (await isDirectory(literal)) {
      current = literal;
      continue;
    }
    const dynamic = await dynamicChild(current);
    if (dynamic && (await isDirectory(join(current, dynamic)))) {
      current = join(current, dynamic);
      continue;
    }
    return null;
  }

  return isFile(join(dist, 'index.html')) ? join(dist, 'index.html') : null;
}

/** Expo's static export writes one HTML file per route, plus assets. */
export function serveDist(dist, port = 0) {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    const file = await resolveExportPath(dist, url.pathname);

    if (file) {
      res.writeHead(200, {
        'content-type': MIME[extname(file)] ?? 'application/octet-stream',
      });
      createReadStream(file).pipe(res);
      return;
    }

    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('not found');
  });

  return new Promise((resolveServer, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () =>
      resolveServer({ server, base: `http://127.0.0.1:${server.address().port}` }),
    );
  });
}
