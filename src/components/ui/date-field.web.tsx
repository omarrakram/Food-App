import { View } from 'react-native';
import { unstable_createElement } from 'react-native-web';

import { useI18n } from '@/i18n';
import { useTheme } from '@/theme';

import { Button } from './button';
import { parseISODate, toISODate, type DateFieldProps } from './date-field';
import { Text } from './text';

export { parseISODate, toISODate } from './date-field';
export type { DateFieldProps } from './date-field';


/**
 * Web build of {@link DateField}.
 *
 * `@react-native-community/datetimepicker` has no web implementation, and a
 * free-text `YYYY-MM-DD` box is the thing we are trying to get rid of. A real
 * `<input type="date">` gives the browser's own calendar, its own locale
 * formatting, and — the point — makes an impossible date unenterable.
 *
 * `unstable_createElement` is react-native-web's supported escape hatch for
 * rendering a DOM element; it is the same mechanism the library uses
 * internally for its own inputs.
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
  const { t } = useI18n();

  const input = unstable_createElement('input', {
    type: 'date',
    value: value ?? '',
    min: minimumDate ? toISODate(minimumDate) : undefined,
    'data-testid': testID,
    onChange: (event: { target: { value: string } }) => {
      const next = event.target.value;
      // An empty field clears the date; anything the browser hands back that
      // is not a real calendar day is ignored rather than stored.
      if (!next) {
        onChange(null);
        return;
      }
      onChange(parseISODate(next) ? next : null);
    },
    style: {
      flex: 1,
      minHeight: 52,
      paddingInline: theme.spacing.lg,
      borderRadius: theme.radius.md,
      borderWidth: 1.5,
      borderStyle: 'solid',
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      color: theme.colors.text,
      fontSize: theme.typography.body.fontSize,
      fontFamily: 'inherit',
      outlineStyle: 'none',
    },
  });

  return (
    <View style={{ gap: theme.spacing.sm }}>
      {label ? (
        <Text variant="subhead" color="textSecondary">
          {label}
        </Text>
      ) : null}

      <View style={{ flexDirection: 'row', gap: theme.spacing.sm, alignItems: 'center' }}>
        {input}
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
    </View>
  );
}
