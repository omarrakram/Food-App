import { useMutation, useQuery } from '@tanstack/react-query';

import { useAuth } from '@/features/auth/auth-provider';
import { env } from '@/lib/config/env';
import { getSupabase } from '@/lib/supabase/client';

import { UPLOAD_RULES, type UploadKind } from './images';
import { pickImage, uploadImage, type UploadResult } from './upload';

/**
 * Pick a photo and upload it.
 *
 * Resolves to `null` when the user cancels the picker, which is the common
 * path and is not an error. Everything else throws, so the caller's error
 * branch only ever sees genuine failures.
 */
export function useImageUpload(kind: UploadKind) {
  const { user } = useAuth();
  const supabase = getSupabase();

  return useMutation<UploadResult | null>({
    mutationFn: async () => {
      // Without a project there is nowhere to put the file. Failing here beats
      // letting someone crop a photo and then telling them.
      if (!supabase || !user) throw new Error('uploads need an account');

      const picked = await pickImage(kind);
      if (!picked) return null;

      return uploadImage(supabase, user.id, kind, picked);
    },
  });
}

/**
 * The URL for an uploaded object.
 *
 * Public buckets resolve to a stable URL. The private one deliberately has no
 * equivalent here: a pending submission photo is reached through a signed URL
 * the moderation flow issues, and offering a `getPublicUrl` for it would
 * produce a link that looks right and 404s.
 */
export function publicImageUrl(bucket: string, path: string): string | null {
  if (bucket === UPLOAD_RULES.recipe.bucket) return null;

  const supabase = getSupabase();
  if (!supabase) {
    return env.recipeImageBaseUrl ? `${env.recipeImageBaseUrl}/${path}` : null;
  }
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

/**
 * A URL for an object in a PRIVATE bucket.
 *
 * `recipe-uploads` is not a public bucket, deliberately: a submission under
 * review must not be reachable by URL, or moderation is advisory. That means
 * `getPublicUrl` cannot serve it — a signed URL is the only thing that
 * carries the reader's authorisation, and the storage policies decide whether
 * signing succeeds.
 *
 * The same call therefore covers both readers, with no branch: a moderator
 * mid-review signs it because the "moderators read submitted" policy admits
 * them, and anybody signs it once the recipe is published because the "read
 * when the recipe is published" policy does. When the recipe is unpublished,
 * signing starts failing in the same statement that took the recipe down.
 *
 * An hour is long enough to read a recipe and short enough that a link pasted
 * somewhere stops working.
 */
const SIGNED_URL_SECONDS = 3600;

export function useStorageImageUrl(
  path: string | null | undefined,
  bucket = UPLOAD_RULES.recipe.bucket,
) {
  const supabase = getSupabase();
  const { user } = useAuth();

  return useQuery({
    // The viewer's id is in the key, and it is not decoration. A signed URL is
    // a BEARER TOKEN: it carries the authorisation of whoever signed it, so a
    // cache entry shared across identities would hand the next signed-in user
    // a link the previous one was entitled to and they are not.
    queryKey: [
      'akla',
      'storage',
      'signed',
      user?.id ?? 'none',
      bucket,
      path ?? 'none',
    ] as const,
    // A path has no scheme; anything that does is already a URL and needs no
    // signing. This is what lets one component render bundled assets, CDN
    // URLs and private objects without the caller sorting them out first.
    enabled: Boolean(supabase && path && !/^[a-z]+:/i.test(path)),
    // Re-sign well before an hour is up, so a long-open screen does not
    // suddenly show a broken image.
    staleTime: (SIGNED_URL_SECONDS - 300) * 1000,
    queryFn: async () => {
      if (!supabase || !path) return null;
      const { data, error } = await supabase.storage
        .from(bucket)
        .createSignedUrl(path, SIGNED_URL_SECONDS);
      // A failure here is usually the policy refusing, which is the correct
      // answer for an unpublished recipe seen by a stranger. The caller
      // renders its fallback rather than an error.
      if (error) return null;
      return data?.signedUrl ?? null;
    },
  });
}
