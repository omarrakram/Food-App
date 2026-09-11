-- Arabic recipe content.
--
-- The UI was fully translated while the food was not: an Arabic reader got
-- «كشري» nowhere and "Koshari — Egypt in a bowl: rice, lentils and pasta"
-- everywhere, which is the half of the product they actually came for.
--
-- Nullable on purpose. A recipe the model generates comes back in one
-- language, and machine-translating a cooking step — where "simmer" and
-- "boil" are different instructions, and a safety note is a safety note — is
-- not something to do silently. Null means "no Arabic yet"; the app falls back
-- to the English text rather than showing a blank.

alter table public.recipes add column if not exists title_ar text;
alter table public.recipes add column if not exists description_ar text;

alter table public.recipes
  add constraint recipes_title_ar_length
  check (title_ar is null or char_length(title_ar) between 1 and 200);

alter table public.recipes
  add constraint recipes_description_ar_length
  check (description_ar is null or char_length(description_ar) <= 2000);

alter table public.recipe_steps add column if not exists instruction_ar text;
alter table public.recipe_steps add column if not exists safety_note_ar text;

alter table public.recipe_steps
  add constraint recipe_steps_instruction_ar_length
  check (instruction_ar is null or char_length(instruction_ar) between 1 and 2000);
