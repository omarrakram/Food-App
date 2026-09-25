import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/ui/button';
import { useRowDirection } from '@/components/ui/direction';
import { Input } from '@/components/ui/input';
import { ListGroup, ListRow } from '@/components/ui/list-row';
import { ScreenHeader, ScreenScroll } from '@/components/ui/screen';
import { Section } from '@/components/ui/section';
import { SkeletonList } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/states';
import { Text } from '@/components/ui/text';
import {
  useMerchantMemberships,
  useMerchantStaff,
  useMerchantStaffActions,
} from '@/features/merchant/hooks';
import { useI18n } from '@/i18n';
import { useTheme } from '@/theme';

/**
 * WHO WORKS HERE.
 *
 * The smallest screen that lets a supermarket run its own rota without ringing
 * AKALT: see the people, add one, remove one. No org chart, no permissions
 * matrix, no shift patterns.
 *
 * THIS SCREEN ENFORCES NOTHING. Every rule — a manager may only invite
 * pickers, only for their own shop, only inside their own branch scope, and an
 * operator may do none of it — lives in `merchant_access.sql`. What the screen
 * does is decline to show a door it knows is locked, which is courtesy rather
 * than security: an operator who reaches this URL gets an empty list from the
 * server, because `merchant_staff` refuses them.
 *
 * THE TOKEN IS SHOWN, NOT SENT. AKALT does not send merchant email in V1, and
 * a button that pretended to would turn an undelivered invitation into an
 * invisible one. The manager reads the code out. It is single-use, tied to the
 * address it was issued for, and expires in a week.
 */
export default function MerchantStaffScreen() {
  const theme = useTheme();
  const { t } = useI18n();
  const router = useRouter();
  const row = useRowDirection();

  const memberships = useMerchantMemberships();
  // One merchant in V1, and the rule is one order one merchant — so the first
  // membership is the shop. A chain manager with two rows still administers
  // one merchant at a time, which this reflects rather than hides.
  const membership = (memberships.data ?? [])[0] ?? null;
  const isManager = (memberships.data ?? []).some((entry) => entry.role === 'admin');

  const staff = useMerchantStaff(membership?.merchantId ?? null);
  const actions = useMerchantStaffActions(membership?.merchantId ?? null);

  const [email, setEmail] = useState('');
  const [issued, setIssued] = useState<string | null>(null);

  if (memberships.isLoading) {
    return (
      <ScreenScroll bottomInset={theme.spacing.huge} contentGap={theme.spacing.lg}>
        <ScreenHeader title={t('merchant.staff.title')} />
        <SkeletonList count={3} variant="row" />
      </ScreenScroll>
    );
  }

  if (!membership || !isManager) {
    return (
      <ScreenScroll bottomInset={theme.spacing.huge} contentGap={theme.spacing.lg}>
        <ScreenHeader title={t('merchant.staff.title')} />
        <EmptyState
          icon="lock-closed-outline"
          title={t('merchant.noAccess')}
          body={t('merchant.staff.notAllowed')}
          action={{ label: t('merchant.title'), onPress: () => router.replace('/merchant') }}
          testID="merchant-team-no-access"
        />
      </ScreenScroll>
    );
  }

  const people = staff.data ?? [];

  return (
    <ScreenScroll bottomInset={theme.spacing.huge} contentGap={theme.spacing.lg}>
      <ScreenHeader title={t('merchant.staff.title')} />

      {staff.isLoading ? (
        <SkeletonList count={3} variant="row" />
      ) : people.length === 0 ? (
        <EmptyState
          icon="people-outline"
          title={t('merchant.staff.empty')}
          body={t('merchant.staff.emptyBody')}
          testID="merchant-team-empty"
        />
      ) : (
        <ListGroup>
          {people.map((person) => (
            <ListRow
              key={person.membershipId}
              icon={person.role === 'admin' ? 'shield-checkmark-outline' : 'person-outline'}
              iconTone={person.role === 'admin' ? 'primary' : 'neutral'}
              title={person.email}
              subtitle={[
                t(`merchant.staff.role.${person.role}`),
                person.locationId ? t('merchant.staff.branch') : t('merchant.staff.allBranches'),
              ].join(' · ')}
              right={
                // A manager removes pickers. Removing another manager is
                // AKALT's call, and the server says so too — this only avoids
                // offering a button that would be refused.
                person.role === 'operator' ? (
                  <Button
                    label={t('merchant.staff.remove')}
                    variant="ghost"
                    size="sm"
                    loading={actions.revokeAccess.isPending}
                    onPress={() => actions.revokeAccess.mutate(person.membershipId)}
                    testID={`merchant-team-remove-${person.membershipId}`}
                  />
                ) : undefined
              }
              testID={`merchant-staff-${person.membershipId}`}
            />
          ))}
        </ListGroup>
      )}

      <Section title={t('merchant.staff.invite')}>
        <View style={{ gap: theme.spacing.sm }}>
          <Input
            label={t('merchant.staff.email')}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            textContentType="emailAddress"
            testID="merchant-team-email"
          />
          <View style={{ flexDirection: row }}>
            <Button
              label={t('merchant.staff.send')}
              loading={actions.invite.isPending}
              disabled={email.trim().length === 0}
              onPress={() => {
                actions.invite.mutate(
                  { email: email.trim(), locationId: membership.locationId },
                  {
                    onSuccess: (result) => {
                      setIssued(result.token);
                      setEmail('');
                    },
                  },
                );
              }}
              testID="merchant-team-send"
            />
          </View>

          {issued ? (
            <View
              style={{
                gap: theme.spacing.xs,
                padding: theme.spacing.md,
                borderRadius: theme.radius.md,
                backgroundColor: theme.colors.surfaceAlt,
              }}
              testID="merchant-team-token"
            >
              <Text variant="footnote">{t('merchant.staff.token', { token: issued })}</Text>
              <Text variant="caption" color="textSecondary">
                {t('merchant.staff.tokenBody')}
              </Text>
            </View>
          ) : null}
        </View>
      </Section>
    </ScreenScroll>
  );
}
