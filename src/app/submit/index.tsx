import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { DemoBanner } from '@/components/messages/demo-banner';
import { Button, IconButton } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Input } from '@/components/ui/input';
import { ScreenHeader, ScreenScroll } from '@/components/ui/screen';
import { Section } from '@/components/ui/section';
import { EmptyState } from '@/components/ui/states';
import { Stepper } from '@/components/ui/stepper';
import { Text } from '@/components/ui/text';
import { useToast } from '@/components/ui/toast';
import { useRepositories } from '@/features/data/repositories';
import { useImageUpload } from '@/features/storage/hooks';
import { searchIngredients } from '@/features/ingredients/matching';
import {
  useMySubmissions,
  useSubmissionActions,
  useSubmissionsAreLive,
} from '@/features/submissions/hooks';
import type { SubmissionDraft } from '@/features/submissions/repository';
import { emptyDraft, validateDraft, type DraftProblem } from '@/features/submissions/validate';
import { useI18n, type TranslationKey } from '@/i18n';
import { presentError } from '@/lib/errors';
import { useTheme } from '@/theme';
import { CUISINES, DIFFICULTIES } from '@/types/domain';

/**
 * Submit a recipe.
 *
 * WHAT SAVE AND SUBMIT MEAN, because they are genuinely different and the
 * difference is the whole feature. Save writes a private recipe and a DRAFT
 * submission: nobody sees it, nothing is queued, and it can be edited freely.
 * Submit hands it to a stranger who will read it, and after that the author
 * cannot change it under them — so Submit is the button that validates, and
 * Save is the one that always works.
 *
 * Ingredients are picked from the catalogue rather than typed free-form
 * wherever possible. A submission whose lines resolve to catalogue slugs can
 * be matched against a pantry, costed, and filtered for allergens like every
 * other recipe; one full of "1 cup of the good flour" is a picture of a recipe
 * rather than a recipe.
 */

type IngredientLine = SubmissionDraft['ingredients'][number];

/** A stepper with its own caption. Three of them in a row need one each. */
function LabelledStepper({
  label,
  testID,
  ...stepper
}: {
  label: string;
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  testID: string;
}) {
  const theme = useTheme();
  return (
    <View style={{ gap: theme.spacing.xs }}>
      <Text variant="caption" color="textTertiary">
        {label}
      </Text>
      <Stepper {...stepper} accessibilityLabel={label} testID={testID} />
    </View>
  );
}

const PROBLEM_TEXT: Record<DraftProblem, TranslationKey> = {
  title_missing: 'submit.problemTitleMissing',
  title_too_long: 'submit.problemTitleLong',
  description_too_long: 'submit.problemDescriptionLong',
  too_few_ingredients: 'submit.problemIngredients',
  ingredient_unnamed: 'submit.problemIngredientUnnamed',
  too_few_steps: 'submit.problemSteps',
  step_empty: 'submit.problemStepEmpty',
  step_too_long: 'submit.problemStepLong',
  time_out_of_range: 'submit.problemTime',
  servings_out_of_range: 'submit.problemServings',
};

export default function SubmitRecipeScreen() {
  const theme = useTheme();
  const { t } = useI18n();
  const router = useRouter();
  const toast = useToast();
  const { demoMode } = useRepositories();
  const isLive = useSubmissionsAreLive();

  const { id } = useLocalSearchParams<{ id?: string }>();
  const mine = useMySubmissions();
  const actions = useSubmissionActions();
  const upload = useImageUpload('recipe');

  const [draft, setDraft] = useState<SubmissionDraft>(emptyDraft());
  const [ingredientQuery, setIngredientQuery] = useState('');
  const [savedId, setSavedId] = useState<string | null>(id ?? null);
  const [showProblems, setShowProblems] = useState(false);

  const problems = useMemo(() => validateDraft(draft), [draft]);
  const existing = (mine.data ?? []).find((entry) => entry.id === savedId);

  const patch = (next: Partial<SubmissionDraft>) => setDraft((current) => ({ ...current, ...next }));

  const suggestions = useMemo(() => {
    if (ingredientQuery.trim().length < 2) return [];
    const chosen = new Set(draft.ingredients.map((line) => line.slug ?? line.name));
    return searchIngredients(ingredientQuery, 6).filter(
      (entry) => !chosen.has(entry.slug) && !chosen.has(entry.name),
    );
  }, [ingredientQuery, draft.ingredients]);

  const addIngredient = (line: IngredientLine) => {
    patch({ ingredients: [...draft.ingredients, line] });
    setIngredientQuery('');
  };

  const editIngredient = (index: number, next: Partial<IngredientLine>) =>
    patch({
      ingredients: draft.ingredients.map((line, at) =>
        at === index ? { ...line, ...next } : line,
      ),
    });

  const removeIngredient = (index: number) =>
    patch({ ingredients: draft.ingredients.filter((_, at) => at !== index) });

  const editStep = (index: number, instruction: string) =>
    patch({
      steps: draft.steps.map((step, at) => (at === index ? { ...step, instruction } : step)),
    });

  /**
   * Attaching a photograph.
   *
   * It goes to `recipe-uploads`, which is not a public bucket: a submission
   * under review must not be reachable by URL, or moderation is advisory. The
   * object never moves — the storage policy makes it readable exactly while
   * the recipe that references it is public, so approval publishes it and
   * unpublishing takes it down in the same statement.
   *
   * The PATH is what goes on the recipe, not a URL. A URL would have to be
   * signed, and a signed URL expires.
   */
  const addPhoto = () => {
    void upload
      .mutateAsync()
      .then((result) => {
        if (result) patch({ imageUrl: result.path });
      })
      .catch((error: unknown) => fail(error));
  };

  const fail = (error: unknown) => {
    const presented = presentError(error);
    toast.show({ message: t(presented.bodyKey, presented.values), tone: 'danger' });
  };

  const save = () => {
    void (async () => {
      try {
        if (savedId) {
          await actions.updateDraft.mutateAsync({ id: savedId, draft });
        } else {
          const created = await actions.createDraft.mutateAsync(draft);
          setSavedId(created);
        }
        toast.show({ message: t('submit.saved'), tone: 'success' });
      } catch (error) {
        fail(error);
      }
    })();
  };

  const submit = () => {
    setShowProblems(true);
    if (problems.length > 0) return;

    void (async () => {
      try {
        const target = savedId ?? (await actions.createDraft.mutateAsync(draft));
        if (savedId) await actions.updateDraft.mutateAsync({ id: savedId, draft });
        setSavedId(target);
        await actions.submit.mutateAsync(target);
        toast.show({ message: t('submit.sent'), tone: 'success' });
        router.replace('/submit/status');
      } catch (error) {
        fail(error);
      }
    })();
  };

  // A guest has no account to submit from, and a submission is a request to
  // publish to everybody — there is no honest local version of it.
  if (!isLive && !demoMode) {
    return (
      <ScreenScroll contentGap={theme.spacing.lg}>
        <ScreenHeader title={t('submit.title')} />
        <EmptyState
          icon="restaurant-outline"
          title={t('submit.needsAccount')}
          body={t('submit.needsAccountBody')}
          testID="submit-needs-account"
        />
      </ScreenScroll>
    );
  }

  return (
    <ScreenScroll bottomInset={theme.spacing.xxl} contentGap={theme.spacing.xl} testID="submit-screen">
      <ScreenHeader title={t('submit.title')} subtitle={t('submit.subtitle')} />

      {isLive ? null : <DemoBanner testID="submit-demo-banner" />}

      {existing?.authorNote ? (
        <View
          testID="submit-feedback"
          style={{
            borderWidth: 1,
            borderColor: theme.colors.warning,
            backgroundColor: theme.colors.warningSoft,
            borderRadius: theme.radius.md,
            padding: theme.spacing.md,
            gap: theme.spacing.xs,
          }}
        >
          <Text variant="subhead" color="warningSoftText">
            {t('submit.changesRequested')}
          </Text>
          <Text variant="footnote" color="warningSoftText">
            {existing.authorNote}
          </Text>
        </View>
      ) : null}

      <Section title={t('submit.aboutTheDish')}>
        <View style={{ gap: theme.spacing.md }}>
          <Input
            value={draft.title}
            onChangeText={(title) => patch({ title })}
            placeholder={t('submit.titlePlaceholder')}
            testID="submit-title"
          />
          <Input
            value={draft.description}
            onChangeText={(description) => patch({ description })}
            placeholder={t('submit.descriptionPlaceholder')}
            multiline
            testID="submit-description"
          />
        </View>
      </Section>

      <Section title={t('submit.photo')} subtitle={t('submit.photoHint')}>
        <View style={{ gap: theme.spacing.sm }}>
          {draft.imageUrl ? (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: theme.spacing.sm,
                backgroundColor: theme.colors.surfaceAlt,
                borderRadius: theme.radius.sm,
                padding: theme.spacing.sm,
              }}
              testID="submit-photo-attached"
            >
              <Ionicons name="image-outline" size={18} color={theme.colors.textSecondary} />
              <Text variant="footnote" color="textSecondary" style={{ flex: 1 }} lines={1}>
                {t('submit.photoAttached')}
              </Text>
              <IconButton
                icon="close"
                size={30}
                variant="ghost"
                onPress={() => patch({ imageUrl: null })}
                accessibilityLabel={t('common.remove')}
                testID="submit-photo-remove"
              />
            </View>
          ) : null}
          <Button
            label={draft.imageUrl ? t('submit.photoReplace') : t('submit.photoAdd')}
            icon="camera-outline"
            variant="secondary"
            onPress={addPhoto}
            loading={upload.isPending}
            testID="submit-photo"
          />
        </View>
      </Section>

      <Section title={t('submit.ingredients')} subtitle={t('submit.ingredientsHint')}>
        <View style={{ gap: theme.spacing.sm }}>
          {draft.ingredients.map((line, index) => (
            <View
              key={`${line.name}-${index}`}
              style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}
              testID={`submit-ingredient-${index}`}
            >
              <View style={{ flex: 1 }}>
                <Text variant="callout">{line.name}</Text>
                {line.slug ? null : (
                  <Text variant="micro" color="textTertiary">
                    {t('submit.notInCatalogue')}
                  </Text>
                )}
              </View>
              <View style={{ width: 78 }}>
                <Input
                  value={line.quantity === null ? '' : String(line.quantity)}
                  onChangeText={(value) => {
                    const parsed = Number(value.replace(/[^0-9.]/g, ''));
                    editIngredient(index, {
                      quantity: value.trim() === '' || !Number.isFinite(parsed) ? null : parsed,
                    });
                  }}
                  keyboardType="numeric"
                  placeholder={t('submit.quantity')}
                  testID={`submit-ingredient-quantity-${index}`}
                />
              </View>
              <IconButton
                icon="close"
                size={32}
                variant="ghost"
                onPress={() => removeIngredient(index)}
                accessibilityLabel={t('common.remove')}
                testID={`submit-ingredient-remove-${index}`}
              />
            </View>
          ))}

          <Input
            value={ingredientQuery}
            onChangeText={setIngredientQuery}
            placeholder={t('submit.addIngredient')}
            leadingIcon="search"
            testID="submit-ingredient-search"
          />

          {suggestions.length > 0 ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs }}>
              {suggestions.map((entry) => (
                <Chip
                  key={entry.slug}
                  label={entry.name}
                  onPress={() =>
                    addIngredient({
                      slug: entry.slug,
                      name: entry.name,
                      quantity: null,
                      unit: entry.defaultUnit ?? null,
                      isOptional: false,
                    })
                  }
                  testID={`submit-ingredient-suggestion-${entry.slug}`}
                />
              ))}
            </View>
          ) : ingredientQuery.trim().length >= 2 ? (
            // Nothing in the catalogue matched. The line is still allowed —
            // refusing it would lose real recipes over a vocabulary gap — but
            // it is marked so a moderator knows it will not match a pantry.
            <Button
              label={t('submit.addAnyway', { name: ingredientQuery.trim() })}
              variant="secondary"
              size="sm"
              onPress={() =>
                addIngredient({
                  slug: null,
                  name: ingredientQuery.trim(),
                  quantity: null,
                  unit: null,
                  isOptional: false,
                })
              }
              testID="submit-ingredient-freeform"
            />
          ) : null}
        </View>
      </Section>

      <Section title={t('submit.steps')}>
        <View style={{ gap: theme.spacing.sm }}>
          {draft.steps.map((step, index) => (
            <View
              key={index}
              style={{ flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing.sm }}
            >
              <View
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: theme.radius.pill,
                  backgroundColor: theme.colors.surfaceAlt,
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginTop: theme.spacing.sm,
                }}
              >
                <Text variant="micro" color="textSecondary">
                  {index + 1}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Input
                  value={step.instruction}
                  onChangeText={(value) => editStep(index, value)}
                  placeholder={t('submit.stepPlaceholder')}
                  multiline
                  testID={`submit-step-${index}`}
                />
              </View>
              {draft.steps.length > 1 ? (
                <IconButton
                  icon="close"
                  size={32}
                  variant="ghost"
                  onPress={() =>
                    patch({ steps: draft.steps.filter((_, at) => at !== index) })
                  }
                  accessibilityLabel={t('common.remove')}
                  testID={`submit-step-remove-${index}`}
                />
              ) : null}
            </View>
          ))}

          <Button
            label={t('submit.addStep')}
            icon="add"
            variant="secondary"
            size="sm"
            onPress={() =>
              patch({ steps: [...draft.steps, { instruction: '', durationMinutes: null }] })
            }
            testID="submit-add-step"
          />
        </View>
      </Section>

      {/*
        The authoring sequence, and the reason for it: a person writing a
        recipe down knows its name, then what it looks like, then what goes in
        it, then what you do. Time, cuisine and difficulty are things they
        answer ABOUT a recipe that already exists — asking for them third, as
        this form used to, is asking somebody to classify a dish they have not
        written yet.

        Nothing about the submission schema changed for this. It is the order
        of four JSX blocks.
      */}
      <Section title={t('submit.timeAndServings')}>
        <View style={{ gap: theme.spacing.md }}>
          <LabelledStepper
            label={t('submit.prep')}
            value={draft.prepMinutes}
            onChange={(prepMinutes) => patch({ prepMinutes })}
            step={5}
            min={0}
            max={1440}
            suffix={t('common.min', { count: draft.prepMinutes })}
            testID="submit-prep"
          />
          <LabelledStepper
            label={t('submit.cook')}
            value={draft.cookMinutes}
            onChange={(cookMinutes) => patch({ cookMinutes })}
            step={5}
            min={0}
            max={1440}
            suffix={t('common.min', { count: draft.cookMinutes })}
            testID="submit-cook"
          />
          <LabelledStepper
            label={t('submit.servings')}
            value={draft.baseServings}
            onChange={(baseServings) => patch({ baseServings })}
            min={1}
            max={50}
            suffix={t('common.peopleUnit', { count: draft.baseServings })}
            testID="submit-servings"
          />
        </View>
      </Section>

      <Section title={t('submit.cuisine')}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs }}>
          {CUISINES.map((cuisine) => (
            <Chip
              key={cuisine}
              label={t(`cuisine.${cuisine}` as TranslationKey)}
              selected={draft.cuisine === cuisine}
              onPress={() => patch({ cuisine: draft.cuisine === cuisine ? null : cuisine })}
              testID={`submit-cuisine-${cuisine}`}
            />
          ))}
        </View>
      </Section>

      <Section title={t('submit.difficulty')}>
        <View style={{ flexDirection: 'row', gap: theme.spacing.xs }}>
          {DIFFICULTIES.map((level) => (
            <Chip
              key={level}
              label={t(`difficulty.${level}` as TranslationKey)}
              selected={draft.difficulty === level}
              onPress={() => patch({ difficulty: level })}
              testID={`submit-difficulty-${level}`}
            />
          ))}
        </View>
      </Section>

      {showProblems && problems.length > 0 ? (
        <View
          testID="submit-problems"
          style={{
            borderWidth: 1,
            borderColor: theme.colors.danger,
            backgroundColor: theme.colors.dangerSoft,
            borderRadius: theme.radius.md,
            padding: theme.spacing.md,
            gap: theme.spacing.xs,
          }}
        >
          <Text variant="subhead" color="dangerSoftText">
            {t('submit.notReady')}
          </Text>
          {problems.map((problem) => (
            <View
              key={problem}
              style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }}
            >
              <Ionicons name="alert-circle-outline" size={13} color={theme.colors.danger} />
              <Text variant="footnote" color="dangerSoftText" style={{ flex: 1 }}>
                {t(PROBLEM_TEXT[problem])}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      <View style={{ gap: theme.spacing.sm }}>
        <Button
          label={t('submit.send')}
          size="lg"
          onPress={submit}
          loading={actions.submit.isPending}
          testID="submit-send"
        />
        <Button
          label={t('submit.saveDraft')}
          variant="secondary"
          onPress={save}
          loading={actions.createDraft.isPending || actions.updateDraft.isPending}
          testID="submit-save"
        />
        <Text variant="micro" color="textTertiary" align="center">
          {t('submit.reviewNote')}
        </Text>
      </View>
    </ScreenScroll>
  );
}
