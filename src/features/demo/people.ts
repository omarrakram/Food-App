import type { PublicProfile } from '@/types/domain';

/**
 * The cast of the demo.
 *
 * WHY THIS FILE EXISTS AT ALL. The hosted preview has no Supabase project
 * behind it, so every social screen — Friends, requests, Messages, sharing,
 * submissions, moderation — would otherwise be an empty state, and "the
 * feature is built" would be a claim nobody could check. These people make the
 * screens walkable.
 *
 * WHAT IT IS NOT. It is not a fallback, a fixture the app falls back to when
 * the network fails, or a seed for a real account. It is reachable only when
 * `EXPO_PUBLIC_DEMO_MODE` is on, which `env` forces off in production, and
 * every screen it feeds renders a DEMO banner. Nothing it does may ever be
 * mistakable for a server having answered.
 *
 * One cast shared by every demo repository, so the person you message is the
 * person in your friend list is the person whose submission you moderate.
 */

/** The viewer's stand-in. Not a real account, and never written to a server. */
export const DEMO_VIEWER_ID = 'demo-user-you';

export const DEMO_NOUR: PublicProfile = {
  id: 'demo-user-nour',
  username: 'nour',
  displayName: 'Nour',
  avatarUrl: null,
  bio: 'Cooks for four, most nights.',
  country: 'EG',
  city: 'Cairo',
  joinedAt: '2026-01-04T09:00:00.000Z',
};

export const DEMO_HASSAN: PublicProfile = {
  id: 'demo-user-hassan',
  username: 'hassan',
  displayName: 'Hassan',
  avatarUrl: null,
  bio: 'Always has too much molokhia.',
  country: 'EG',
  city: 'Alexandria',
  joinedAt: '2026-02-17T09:00:00.000Z',
};

/** Sends the viewer a friend request, so the Requests tab has something in it. */
export const DEMO_LAYLA: PublicProfile = {
  id: 'demo-user-layla',
  username: 'layla',
  displayName: 'Layla',
  avatarUrl: null,
  bio: 'Learning to bake.',
  country: 'EG',
  city: 'Giza',
  joinedAt: '2026-05-02T09:00:00.000Z',
};

/** The viewer has sent this one a request nobody has answered. */
export const DEMO_OMAR: PublicProfile = {
  id: 'demo-user-omar',
  username: 'omar',
  displayName: 'Omar',
  avatarUrl: null,
  bio: 'Grills everything.',
  country: 'EG',
  city: 'Cairo',
  joinedAt: '2026-03-11T09:00:00.000Z',
};

export const DEMO_PEOPLE: readonly PublicProfile[] = [
  DEMO_NOUR,
  DEMO_HASSAN,
  DEMO_LAYLA,
  DEMO_OMAR,
];

export function demoPerson(id: string): PublicProfile | undefined {
  return DEMO_PEOPLE.find((person) => person.id === id);
}
