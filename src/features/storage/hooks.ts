import { useMutation, useQuery } from '@tanstack/react-query';

import { useAuth } from '@/features/auth/auth-provider';
import { env } from '@/lib/config/env';
import { getSupabase } from '@/lib/supabase/client';

import { UPLOAD_RULES, validateImage, type UploadKind } from './images';
import { ImageRejected, pickImage, uploadImage, type UploadResult } from './upload';

/**
 * What the user ended up with after choosing a photo.
 *
 * `stored` is the whole point of the type. An uploaded photo has a path in a
 * bucket and outlives the session; a local one is a URI this device can render
 * and nothing more. Collapsing the two into a single "imageUrl" is how a
 * preview build ends up implying a file reached a server.
 */
export type PhotoSelection =
  | ({ stored: true } & UploadResult)
  | { stored: false; uri: string; width: number; height: number };

/**
 * Pick a photo, and upload it if there is anywhere to upload it to.
 *
 * PICKING AND UPLOADING ARE DIFFERENT THINGS, and conflating them is what
 * broke this. The previous version opened with
 *
 *     if (!supabase || !user) throw new Error('uploads need an account');
 *
 * so in a build with no Supabase project — the hosted preview, every time —
 * pressing "Add a photo" threw before the picker opened, and the submit screen
 * turned that into "Something went wrong". Nothing had gone wrong. There was
 * simply nowhere to PUT the file, which says nothing about whether the user
 * may CHOOSE one.
 *
 * So: pick first, validate against the same rules the buckets enforce, then
 * branch on whether a backend exists. With one, the photo goes to
 * `recipe-uploads` exactly as designed. Without one, the local URI comes back
 * marked `stored: false` and the caller is responsible for saying so.
 *
 * Resolves to `null` when the user cancels, which is the common path and is
 * not an error. A rejected photo throws `ImageRejected` carrying which rule it
 * broke, so the caller can say "that image is too large" rather than
 * "something went wrong".
 */
export function useImageUpload(kind: UploadKind) {
  const { user } = useAuth();
  const supabase = getSupabase();

  return useMutation<PhotoSelection | null>({
    mutationFn: async () => {
      const picked = await pickImage(kind);
      if (!picked) return null;

      // Checked here rather than only inside `uploadImage`, so the local path
      // rejects a 40MB file for the same reason the uploading one does. A
      // preview that accepts what production refuses is not a preview.
      const problem = validateImage(picked, kind);
      if (problem) throw new ImageRejected(problem);

      if (!supabase || !user) {
        return {
          stored: false,
          uri: picked.uri,
          width: picked.width,
          height: picked.height,
        };
      }

      return { stored: true, ...(await uploadImage(supabase, user.id, kind, picked)) };
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
