import { useCallback, useState } from 'react';
import { View } from 'react-native';

import { useI18n } from '@/i18n';
import { useTheme } from '@/theme';

import { Chip } from './chip';
import { Input } from './input';
import { Text } from './text';

export type TagInputProps = {
  values: readonly string[];
  onChange: (next: string[]) => void;
  label?: string;
  placeholder?: string;
  /** Offered as one-tap additions above the free-text field. */
  suggestions?: readonly string[];
  /** Upper bound so a runaway paste cannot fill storage. */
  maxTags?: number;
  testID?: string;
};

/** Splits on the separators people actually type: comma, Arabic comma, newline. */
const SEPARATORS = /[,،\n]/;

const MAX_TAG_LENGTH = 40;

/**
 * Free-form tag entry.
 *
 * Disliked foods used to be a single text field whose contents were opaque
 * once submitted — you could not see what was stored, and you could not remove
 * one entry without clearing the lot. Each value is now its own removable
 * token, entries can be typed or tapped, and a pasted "mushrooms, olives"
 * becomes two tags rather than one.
 */
export function TagInput({
  values,
  onChange,
  label,
  placeholder,
  suggestions = [],
  maxTags = 30,
  testID,
}: TagInputProps) {
  const theme = useTheme();
  const { t } = useI18n();
  const [draft, setDraft] = useState('');

  const add = useCallback(
    (raw: string) => {
      const candidates = raw
        .split(SEPARATORS)
        .map((entry) => entry.trim().toLowerCase().slice(0, MAX_TAG_LENGTH))
        .filter(Boolean);
      if (candidates.length === 0) return;

      const next = [...values];
      for (const candidate of candidates) {
        if (next.length >= maxTags) break;
        if (!next.includes(candidate)) next.push(candidate);
      }
      onChange(next);
      setDraft('');
    },
    [values, onChange, maxTags],
  );

  const remove = useCallback(
    (value: string) => onChange(values.filter((entry) => entry !== value)),
    [values, onChange],
  );

  // Typing "mushrooms," should commit the tag without waiting for submit.
  const handleChange = useCallback(
    (text: string) => {
      if (SEPARATORS.test(text)) {
        add(text);
        return;
      }
      setDraft(text);
    },
    [add],
  );

  const remaining = suggestions.filter((entry) => !values.includes(entry));
  const isFull = values.length >= maxTags;

  return (
    <View style={{ gap: theme.spacing.md }}>
      <Input
        label={label}
        value={draft}
        onChangeText={handleChange}
        onSubmitEditing={() => add(draft)}
        onBlur={() => add(draft)}
        placeholder={placeholder}
        editable={!isFull}
        returnKeyType="done"
        autoCapitalize="none"
        autoCorrect={false}
        trailingIcon={draft.trim() ? 'add' : undefined}
        onTrailingIconPress={draft.trim() ? () => add(draft) : undefined}
        testID={testID}
      />

      {values.length > 0 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
          {values.map((value) => (
            <Chip
              key={value}
              label={value}
              selected
              onRemove={() => remove(value)}
              testID={`${testID ?? 'tag'}-tag-${value}`}
            />
          ))}
        </View>
      ) : null}

      {remaining.length > 0 && !isFull ? (
        <View style={{ gap: theme.spacing.sm }}>
          <Text variant="micro" color="textTertiary">
            {t('common.suggestions')}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
            {remaining.map((value) => (
              <Chip
                key={value}
                label={value}
                size="sm"
                onPress={() => add(value)}
                testID={`${testID ?? 'tag'}-suggest-${value}`}
              />
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}
