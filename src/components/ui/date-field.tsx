import DateTimePicker from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Platform, View } from 'react-native';

import { useI18n } from '@/i18n';
import { useTheme } from '@/theme';

import { Button } from './button';
import { Text } from './text';

export type DateFieldProps = {
  label?: string;
  /** ISO `YYYY-MM-DD`, or null for "no date". */
  value: string | null;
  onChange: (next: string | null) => void;
  /** Earliest date the user may pick. Defaults to today. */
  minimumDate?: Date;
  clearLabel?: string;
  testID?: string;
};

/** `YYYY-MM-DD` in local time. `toISOString` would shift across midnight. */
export function toISODate(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * Parses an ISO date STRICTLY.
 *
 * `new Date('2026-02-31')` happily returns 3 March, so a typo silently becomes
 * a real but wrong date. This rejects anything that does not round-trip, which
 * is the only way to catch a day that does not exist in that month.
 */
export function parseISODate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number) as [number, number, number];
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
}

function formatForDisplay(iso: string, locale: string): string {
  const parsed = parseISODate(iso);
  if (!parsed) return iso;
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(parsed);
  } catch {
    return iso;
  }
}

/**
 * Date entry backed by the platform's own picker.
 *
 * Typing `YYYY-MM-DD` into a free-text box asks the user to know a format and
 * lets them enter 31 February. The native picker cannot produce an invalid
 * date at all; the web build overrides this file with a real `<input
 * type="date">`, which gets the browser's calendar for the same reason.
 */
export function DateField({
  label,
  value,
  onChange,
  minimumDate,
  clearLabel,
  testID,
}: DateFieldProps) {
  const theme = useTheme();
  const { t, language } = useI18n();
  const [isOpen, setIsOpen] = useState(false);

  const locale = language === 'ar' ? 'ar-EG' : 'en-GB';
  const selected = value ? parseISODate(value) : null;

  return (
    <View style={{ gap: theme.spacing.sm }}>
      {label ? (
        <Text variant="subhead" color="textSecondary">
          {label}
        </Text>
      ) : null}

      <View style={{ flexDirection: 'row', gap: theme.spacing.sm, alignItems: 'center' }}>
        <Button
          label={value ? formatForDisplay(value, locale) : t('pantry.pickDate')}
          icon="calendar-outline"
          variant="secondary"
          size="md"
          onPress={() => setIsOpen(true)}
          style={{ flex: 1 }}
          testID={testID}
        />
        {value ? (
          <Button
            label={clearLabel ?? t('common.clear')}
            variant="ghost"
            size="sm"
            onPress={() => onChange(null)}
            testID={testID ? `${testID}-clear` : undefined}
          />
        ) : null}
      </View>

      {isOpen ? (
        <DateTimePicker
          mode="date"
          display={Platform.OS === 'ios' ? 'inline' : 'default'}
          value={selected ?? minimumDate ?? new Date()}
          minimumDate={minimumDate}
          onChange={(event, date) => {
            // Android fires once and dismisses itself; iOS inline stays open
            // until the user is done with it.
            if (Platform.OS !== 'ios') setIsOpen(false);
            if (event.type === 'dismissed') return;
            if (date) onChange(toISODate(date));
          }}
        />
      ) : null}

      {isOpen && Platform.OS === 'ios' ? (
        <Button
          label={t('common.done')}
          size="md"
          onPress={() => setIsOpen(false)}
          testID={testID ? `${testID}-done` : undefined}
        />
      ) : null}
    </View>
  );
}
