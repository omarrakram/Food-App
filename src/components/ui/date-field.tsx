import DateTimePicker from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Platform, View } from 'react-native';

import { useI18n } from '@/i18n';
import { useTheme } from '@/theme';

import { Button } from './button';
import {
  formatDateForDisplay,
  parseISODate,
  toISODate,
  type DateFieldProps,
} from './date-field.shared';
import { Text } from './text';

// Re-exported so callers can keep importing helpers from './date-field'.
// Safe here because the native file's own imports never round-trip through a
// platform-resolved specifier.
export { formatDateForDisplay, parseISODate, toISODate } from './date-field.shared';
export type { DateFieldProps } from './date-field.shared';

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
          label={value ? formatDateForDisplay(value, locale) : t('pantry.pickDate')}
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
