-- A shared recipe does not need a covering note.
--
-- `messages_body_length` required 1..4000 characters, which made the most
-- ordinary sharing gesture in the product — tapping Share, picking a friend,
-- sending the card with nothing to add — impossible to express. The app would
-- have had to invent a body ("Shared a recipe"), and an invented body is a
-- message the user did not write appearing in a chat log under their name.
--
-- So: a message must carry SOMETHING, and a recipe reference counts as
-- something. An empty message with no attachment is still refused.

alter table public.messages
  drop constraint messages_body_length;

alter table public.messages
  add constraint messages_body_length
  check (
    char_length(body) <= 4000
    and (char_length(body) >= 1 or shared_recipe_id is not null)
  );

comment on constraint messages_body_length on public.messages is
  'A message carries words, a recipe, or both — never nothing.';
