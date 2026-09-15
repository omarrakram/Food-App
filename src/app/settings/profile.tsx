import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScreenHeader, ScreenScroll } from '@/components/ui/screen';
import { Section } from '@/components/ui/section';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Text } from '@/components/ui/text';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/features/auth/auth-provider';
import {
  BIO_MAX_LENGTH,
  DISPLAY_NAME_MAX_LENGTH,
  normaliseHandleInput,
  validateBio,
} from '@/features/profile/handle';
import { useHandleAvailability, useOwnProfile, useUpdateProfile } from '@/features/profile/hooks';
import { ImageRejected } from '@/features/storage/upload';
import { publicImageUrl, useImageUpload } from '@/features/storage/hooks';
import { UPLOAD_RULES } from '@/features/storage/images';
import { useI18n } from '@/i18n';
import { presentError } from '@/lib/errors';
import { useTheme } from '@/theme';
import type { OwnProfile, ProfileVisibility } from '@/types/domain';

/**
 * Editing your public identity.
 *
 * Everything on this screen is what OTHER people see. Nothing private is
 * editable here and nothing private is displayed here — allergies, the pantry
 * and dietary targets live under Preferences, which is a different screen for
 * a reason: it should never be possible to change a privacy setting and
 * wonder whether you have just published a medical fact.
 */
type FormState = {
  handle: string;
  displayName: string;
  bio: string;
  city: string;
  visibility: ProfileVisibility;
  showCity: boolean;
};

const EMPTY_FORM: FormState = {
  handle: '',
  displayName: '',
  bio: '',
  city: '',
  visibility: 'public',
  showCity: false,
};

function formFrom(profile: OwnProfile): FormState {
  return {
    handle: profile.username ?? '',
    displayName: profile.displayName ?? '',
    bio: profile.bio ?? '',
    city: profile.city ?? '',
    visibility: profile.visibility,
    showCity: profile.showCity,
  };
}

export default function EditProfileScreen() {
  const theme = useTheme();
  const { t } = useI18n();
  const router = useRouter();
  const toast = useToast();
  const { isEnabled } = useAuth();
  const profile = useOwnProfile();
  const update = useUpdateProfile();
  const avatarUpload = useImageUpload('avatar');

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [seededFrom, setSeededFrom] = useState<string | null>(null);

  /**
   * Seeded during render, once per identity.
   *
   * Not in an effect: an effect would paint an empty form first and then
   * overwrite it, and — worse — would re-seed on every background refetch,
   * discarding whatever the user was part-way through typing. Keying on the
   * profile id means it re-seeds when the ACCOUNT changes and at no other
   * time.
   */
  if (profile.data && seededFrom !== profile.data.id) {
    setSeededFrom(profile.data.id);
    setForm(formFrom(profile.data));
    setAvatarUrl(profile.data.avatarUrl);
  }

  const chooseAvatar = () => {
    void (async () => {
      try {
        const chosen = await avatarUpload.mutateAsync();
        // Cancelling the picker is the common path and is not an error.
        if (!chosen) return;

        // No backend, so the photo went nowhere. Show it — it is a real
        // choice the user made and the preview should reflect it — but say
        // plainly that it did not leave the device, and do not write it to a
        // profile that has no server to hold it.
        if (!chosen.stored) {
          setAvatarUrl(chosen.uri);
          toast.show({ message: t('profile.avatarLocalOnly'), tone: 'neutral' });
          return;
        }

        const url = publicImageUrl(UPLOAD_RULES.avatar.bucket, chosen.path);
        setAvatarUrl(url);
        // Saved immediately rather than on the form's Save. A photo the user
        // has already watched upload is a change they consider made, and
        // leaving it unsaved means losing it to a back gesture.
        await update.mutateAsync({ avatarUrl: url });
        toast.show({ message: t('profile.avatarUpdated'), tone: 'success' });
      } catch (error) {
        // A rejected photo gets its specific reason; anything else gets the
        // generic presenter. "That image is too large" beats "Something went
        // wrong" when the user can act on it.
        const message =
          error instanceof ImageRejected
            ? t(`profile.avatar.${error.problem}` as const)
            : t(presentError(error).bodyKey, presentError(error).values);
        toast.show({ message, tone: 'danger' });
      }
    })();
  };

  const { handle, displayName, bio, city, visibility, showCity } = form;
  const edit = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const availability = useHandleAvailability(handle, profile.data?.username ?? null);
  const bioProblem = validateBio(bio);

  const handleMessage =
    availability.problem !== null
      ? t(availability.problem)
      : availability.state === 'taken'
        ? t('profile.handle.taken')
        : null;

  const canSave =
    isEnabled &&
    handleMessage === null &&
    bioProblem === null &&
    availability.state !== 'checking' &&
    !update.isPending;

  const save = () => {
    void (async () => {
      try {
        await update.mutateAsync({
          username: handle.trim() || null,
          displayName: displayName.trim() || null,
          bio: bio.trim() || null,
          city: city.trim() || null,
          visibility,
          showCity,
        });
        toast.show({ message: t('profile.saved'), tone: 'success' });
        router.back();
      } catch (error) {
        const presented = presentError(error);
        toast.show({ message: t(presented.bodyKey, presented.values), tone: 'danger' });
      }
    })();
  };

  return (
    <ScreenScroll bottomInset={theme.spacing.xxl} contentGap={theme.spacing.lg}>
      <ScreenHeader title={t('profile.editTitle')} />

      {!isEnabled ? (
        // Honest rather than decorative: with no backend there is no shared
        // namespace to claim a handle in, and pretending otherwise would let
        // someone "reserve" a name that is not reserved at all.
        <Text variant="footnote" color="textSecondary">
          {t('profile.editNeedsAccount')}
        </Text>
      ) : null}

      <Section title={t('profile.editIdentity')}>
        <View style={{ gap: theme.spacing.md }}>
          <View style={{ alignItems: 'center', gap: theme.spacing.sm }}>
            <Avatar url={avatarUrl} fallback={displayName || handle} size={96} />
            <Button
              label={avatarUrl ? t('profile.avatarChange') : t('profile.avatarAdd')}
              variant="ghost"
              size="sm"
              icon="camera-outline"
              loading={avatarUpload.isPending}
              disabled={!isEnabled}
              onPress={chooseAvatar}
              testID="profile-avatar"
            />
          </View>

          <Input
            label={t('profile.username')}
            value={handle}
            onChangeText={(next) => edit('handle', normaliseHandleInput(next))}
            placeholder={t('profile.usernamePlaceholder')}
            autoCapitalize="none"
            autoCorrect={false}
            leadingIcon="at-outline"
            editable={isEnabled}
            error={handleMessage}
            hint={
              availability.state === 'checking'
                ? t('profile.handle.checking')
                : availability.state === 'available' && handle.length > 0
                  ? t('profile.handle.available')
                  : undefined
            }
            testID="profile-username"
          />

          <Input
            label={t('profile.displayName')}
            value={displayName}
            onChangeText={(next) => edit('displayName', next)}
            maxLength={DISPLAY_NAME_MAX_LENGTH}
            leadingIcon="person-outline"
            testID="profile-display-name"
          />

          <Input
            label={t('profile.bio')}
            value={bio}
            onChangeText={(next) => edit('bio', next)}
            multiline
            numberOfLines={3}
            maxLength={BIO_MAX_LENGTH}
            error={bioProblem ? t(bioProblem) : null}
            hint={t('profile.bioHint', { count: BIO_MAX_LENGTH - bio.length })}
            testID="profile-bio"
          />
        </View>
      </Section>

      <Section title={t('profile.editVisibility')} subtitle={t('profile.editVisibilityHint')}>
        <View style={{ gap: theme.spacing.md }}>
          <SegmentedControl<ProfileVisibility>
            options={[
              { value: 'public', label: t('profile.visibilityPublic') },
              { value: 'friends', label: t('profile.visibilityFriends') },
              { value: 'private', label: t('profile.visibilityPrivate') },
            ]}
            value={visibility}
            onChange={(next) => edit('visibility', next)}
            testID="profile-visibility"
          />

          <Input
            label={t('profile.city')}
            value={city}
            onChangeText={(next) => edit('city', next)}
            leadingIcon="location-outline"
            testID="profile-city"
          />

          <Button
            label={showCity ? t('profile.cityShown') : t('profile.cityHidden')}
            variant={showCity ? 'secondary' : 'ghost'}
            size="md"
            fullWidth
            icon={showCity ? 'eye-outline' : 'eye-off-outline'}
            onPress={() => edit('showCity', !showCity)}
            testID="profile-show-city"
          />

          {/*
            Stated on the screen, not just enforced in the database. Someone
            deciding how visible to be deserves to know what is NOT on the
            table — and it is the one reassurance this app owes its users.
          */}
          <Text variant="micro" color="textTertiary">
            {t('profile.privacyReassurance')}
          </Text>
        </View>
      </Section>

      <Button
        label={t('common.save')}
        onPress={save}
        loading={update.isPending}
        disabled={!canSave}
        size="lg"
        testID="profile-save"
      />
    </ScreenScroll>
  );
}
