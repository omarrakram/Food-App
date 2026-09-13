import type { SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'expo-crypto';
import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import { AppError, toAppError } from '@/lib/errors';
import { logInfo } from '@/lib/logger';
import type { Database } from '@/lib/supabase/database.types';

import {
  objectPath,
  targetSize,
  UPLOAD_CONTENT_TYPE,
  UPLOAD_RULES,
  validateImage,
  type ImageProblem,
  type PickedImage,
  type UploadKind,
} from './images';

/**
 * Picking, re-encoding and uploading a photo.
 *
 * A thin shell over `images.ts`, which holds every rule. This file is the part
 * that touches native modules and the network, and it is deliberately the part
 * with no decisions in it.
 *
 * The order matters and is not an accident:
 *
 *   1. VALIDATE the original. Rejecting a 40MB panorama before spending three
 *      seconds re-encoding it is the difference between a fast "that photo is
 *      too big" and a spinner that ends in one.
 *   2. RE-ENCODE to JPEG at a bounded size. This is what strips EXIF — GPS
 *      coordinates, device serial, timestamp — and an avatar is the most
 *      likely thing in this app to be published with someone's home address
 *      attached.
 *   3. UPLOAD to a path we generated. The user's filename is never involved.
 *
 * None of this is a security boundary. The bucket's own size and mime-type
 * limits and its ownership policies are; this is the part that makes the
 * common case fast and the error messages useful.
 */

export type UploadResult = {
  /** Path inside the bucket. Not a URL — see `resolveRecipeImageUrl`. */
  path: string;
  bucket: string;
  width: number;
  height: number;
};

export class ImageRejected extends AppError {
  readonly problem: ImageProblem;

  constructor(problem: ImageProblem) {
    super('validation');
    this.name = 'ImageRejected';
    this.problem = problem;
  }
}

/** Opens the library and returns what the user chose, or null if they cancelled. */
export async function pickImage(kind: UploadKind): Promise<PickedImage | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) throw new AppError('forbidden');

  const result = await ImagePicker.launchImageLibraryAsync({
    // `MediaTypeOptions` is deprecated in SDK 57; the array of string literals
    // is the current shape.
    mediaTypes: ['images'],
    allowsEditing: true,
    // A square crop for an avatar, 4:3 for a dish. Cropping at pick time beats
    // cropping at render time: the bytes we store are the bytes we show.
    aspect: kind === 'avatar' ? [1, 1] : [4, 3],
    // 1 here, compression later: the picker's quality knob would re-encode
    // once and `renderAsync` again, so two lossy passes for no benefit.
    quality: 1,
    exif: false,
  });

  if (result.canceled) return null;
  const asset = result.assets[0];
  if (!asset) return null;

  return {
    uri: asset.uri,
    width: asset.width,
    height: asset.height,
    mimeType: asset.mimeType,
    fileSize: asset.fileSize,
    fileName: asset.fileName,
  };
}

/**
 * Re-encodes to a bounded JPEG.
 *
 * Uses the contextual manipulator API. `manipulateAsync` is deprecated in
 * SDK 57 and its replacement is this chain: `manipulate` builds a context,
 * transformations are scheduled synchronously, and `renderAsync` awaits them.
 */
export async function compressImage(
  image: PickedImage,
  kind: UploadKind,
): Promise<{ uri: string; width: number; height: number }> {
  const problem = validateImage(image, kind);
  if (problem) throw new ImageRejected(problem);

  const size = targetSize(image, kind);
  const context = ImageManipulator.manipulate(image.uri);
  context.resize({ width: size.width, height: size.height });

  const rendered = await context.renderAsync();
  const saved = await rendered.saveAsync({
    format: SaveFormat.JPEG,
    compress: UPLOAD_RULES[kind].quality,
  });

  return { uri: saved.uri, width: saved.width, height: saved.height };
}

/**
 * Uploads a prepared image and returns its path.
 *
 * `upsert: false`. The path carries a fresh uuid every time, so a collision
 * would mean something has gone wrong rather than that the user is replacing
 * a photo — and silently overwriting under those circumstances is how one
 * user's avatar ends up on another's profile.
 */
export async function uploadImage(
  client: SupabaseClient<Database>,
  userId: string,
  kind: UploadKind,
  image: PickedImage,
): Promise<UploadResult> {
  const prepared = await compressImage(image, kind);
  const { bucket } = UPLOAD_RULES[kind];
  const path = objectPath(userId, kind, randomUUID());

  // `File.bytes()` rather than a fetch on the file:// URI: React Native's
  // fetch does not reliably support that scheme across platforms, and a Blob
  // built from it loses its length on Android. It returns a Promise — the
  // supabase upload signature is loose enough to accept an unawaited one and
  // upload nothing useful, so the await is load-bearing.
  const bytes = await new File(prepared.uri).bytes();

  const { error } = await client.storage.from(bucket).upload(path, bytes, {
    contentType: UPLOAD_CONTENT_TYPE,
    upsert: false,
  });

  if (error) throw toAppError(error, 'offline');

  logInfo('image_uploaded', {
    bucket,
    kind,
    width: prepared.width,
    height: prepared.height,
  });

  return { path, bucket, width: prepared.width, height: prepared.height };
}

/** Removes an object the user owns. Best effort: a stale file is not an error. */
export async function deleteImage(
  client: SupabaseClient<Database>,
  bucket: string,
  path: string,
): Promise<void> {
  await client.storage.from(bucket).remove([path]);
}
