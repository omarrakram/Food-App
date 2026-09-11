import { assertEquals } from 'jsr:@std/assert@^1.0.0';

import { corsHeaders, isOriginAllowed } from '../http.ts';

/**
 * CORS used to echo whatever Origin arrived whenever ALLOWED_ORIGINS was
 * unset, which turns a forgotten environment variable into "any website may
 * call this with the visitor's credentials". These pin the safe default.
 *
 * Run: npm run fn:test
 */

Deno.test('a native caller with no Origin is unaffected', () => {
  // CORS is a browser mechanism; the mobile app sends no Origin at all.
  assertEquals(isOriginAllowed(null), true);
  assertEquals(corsHeaders(null)['Access-Control-Allow-Origin'], undefined);
});

Deno.test('localhost is allowed during development', () => {
  assertEquals(isOriginAllowed('http://localhost:8081'), true);
  assertEquals(isOriginAllowed('http://127.0.0.1:3000'), true);
  assertEquals(isOriginAllowed('https://localhost'), true);
});

Deno.test('an arbitrary origin is NOT echoed back', () => {
  assertEquals(isOriginAllowed('https://evil.example'), false);

  const headers = corsHeaders('https://evil.example');
  assertEquals(headers['Access-Control-Allow-Origin'], undefined);
});

Deno.test('a lookalike localhost origin is refused', () => {
  // The pattern is anchored, so these must not pass as development hosts.
  assertEquals(isOriginAllowed('https://localhost.evil.example'), false);
  assertEquals(isOriginAllowed('https://notlocalhost'), false);
  assertEquals(isOriginAllowed('https://127.0.0.1.evil.example'), false);
});

Deno.test('Vary: Origin is always set, so caches cannot cross-serve', () => {
  assertEquals(corsHeaders('http://localhost:8081')['Vary'], 'Origin');
  assertEquals(corsHeaders(null)['Vary'], 'Origin');
});
