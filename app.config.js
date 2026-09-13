/**
 * Expo config.
 *
 * Everything lives in app.json; this wrapper exists for two reasons.
 *
 * 1. The hosted web preview is served from a subpath (`/Food-App/` on GitHub
 *    Pages), and expo-router has to know that at build time so the links it
 *    writes resolve. Setting it here rather than in app.json keeps native
 *    builds untouched — no env var, no base URL, exactly as before.
 *
 *        EXPO_WEB_BASE_URL=/Food-App npx expo export --platform web
 *
 * 2. The build stamps its own commit and time into the bundle. Without that
 *    there is no way to tell whether a deployed preview is the code you think
 *    it is — and "is this even the build I fixed?" is the first question worth
 *    answering when someone reports a bug against a hosted URL.
 */
const { execSync } = require('node:child_process');

const appJson = require('./app.json');

/** The commit being built, or null outside a git checkout. */
function gitSha() {
  // CI checks out a detached HEAD, so the env var is the reliable source
  // there and `git` is the fallback for a local build.
  const fromCi = process.env.GITHUB_SHA;
  if (fromCi) return fromCi.slice(0, 7);
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    // A tarball with no .git is a legitimate way to build. Say so rather than
    // inventing a value that would later look like a real commit.
    return null;
  }
}

module.exports = () => {
  const baseUrl = process.env.EXPO_WEB_BASE_URL;

  return {
    ...appJson.expo,
    experiments: {
      ...(appJson.expo.experiments ?? {}),
      ...(baseUrl ? { baseUrl } : {}),
    },
    extra: {
      ...(appJson.expo.extra ?? {}),
      build: {
        commit: gitSha(),
        builtAt: new Date().toISOString(),
      },
    },
  };
};
