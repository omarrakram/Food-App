# Builds and releases

## One-time setup

```bash
npm install -g eas-cli
eas login
eas init                # writes the real projectId into app.json
```

`app.json` currently carries a placeholder `extra.eas.projectId`. `eas init`
replaces it; commit the result.

## Secrets

`EXPO_PUBLIC_*` values are **in the app bundle**. Only the Supabase URL, the
anon key, feature flags and OAuth client ids belong there. The anon key is safe
only because RLS is enabled on every table.

```bash
eas secret:create --scope project --name EXPO_PUBLIC_SUPABASE_URL --value https://xxx.supabase.co
eas secret:create --scope project --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value eyJ...
```

Never create an EAS secret for `ANTHROPIC_API_KEY`, a Supabase service-role
key, or a grocery provider credential. Those are Supabase Function secrets:

```bash
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
```

## Profiles

| Profile | Distribution | Use |
|---|---|---|
| `development` | internal, dev client | Native debugging with hot reload |
| `preview` | internal (APK / ad-hoc IPA) | Share a build with testers |
| `production` | store (AAB / IPA) | TestFlight and the Play Store |

## Build

```bash
eas build --profile development --platform ios
eas build --profile preview     --platform all
eas build --profile production  --platform all
```

`production` uses `autoIncrement`, so build numbers advance without editing
`app.json`.

## Submit

Fill the placeholders in `eas.json` → `submit.production` first.

```bash
eas submit --platform ios      --profile production
eas submit --platform android  --profile production
```

The Android submit expects `google-play-service-account.json` in the project
root. It is git-ignored; keep it out of the repository.

## Over-the-air updates

Channels are configured per profile. To ship a JS-only fix without a store
review:

```bash
eas update --channel production --message "Fix shopping list merge"
```

This cannot change native code. Anything touching `app.json` plugins, a new
native module, or permissions needs a full build.
