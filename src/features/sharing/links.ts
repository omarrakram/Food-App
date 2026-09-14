import * as Linking from 'expo-linking';

import { env } from '@/lib/config/env';

/**
 * Share links.
 *
 * TWO KINDS, AND THEY ARE NOT THE SAME THING.
 *
 * An IN-APP share puts a `shared_recipe_id` on a message. No link, no copy of
 * the content — the card renders the recipe as it is now, and a recipe that is
 * later unpublished stops rendering rather than living on in a chat log.
 *
 * An EXTERNAL share is a URL for people who are not in a conversation with
 * you, or not in the app at all. It has to work in three places at once: a
 * browser (the hosted web build), an installed app (the `akla://` scheme), and
 * a phone with neither (the web build again, which is the same screen).
 *
 * `Linking.createURL` is what makes that true rather than aspirational: on
 * native it produces `akla://recipe/<id>`, and on web it produces an absolute
 * URL under whatever base path the bundle was exported with — which is
 * `/Food-App/` on the GitHub Pages preview and `/` in production. Hand-writing
 * either one is how a link ends up 404ing on exactly one of the three.
 *
 * `EXPO_PUBLIC_WEB_ORIGIN` overrides the origin so a NATIVE build can still
 * produce a link a browser can open — a native app sharing `akla://recipe/x`
 * to someone without the app installed has shared nothing.
 */

/** Where the web build lives, for links that have to survive leaving the app. */
const WEB_ORIGIN = env.webOrigin;

export type ShareTarget = { path: string; title: string };

/** The in-app route for a recipe. Also the web path, by construction. */
export function recipePath(recipeId: string): string {
  return `/recipe/${recipeId}`;
}

/**
 * A link to a recipe that works outside the app.
 *
 * Prefers the configured web origin, because that is the one that opens for
 * everybody. Falls back to the app scheme only when no web build is
 * configured — better a link that works for people who have the app than no
 * link at all.
 */
export function recipeShareUrl(recipeId: string): string {
  const path = recipePath(recipeId);
  if (WEB_ORIGIN) return `${WEB_ORIGIN.replace(/\/+$/, '')}${path}`;
  return Linking.createURL(path.replace(/^\//, ''));
}

/**
 * What gets put on the clipboard or into the OS share sheet.
 *
 * The title comes first because most share surfaces show one line, and "Koshari
 * — Akla" tells the recipient more than a URL does.
 */
export function recipeShareText(title: string, recipeId: string): string {
  return `${title}\n${recipeShareUrl(recipeId)}`;
}
