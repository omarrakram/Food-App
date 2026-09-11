/**
 * Expo config.
 *
 * Everything lives in app.json; this wrapper exists for one reason: the hosted
 * web preview is served from a subpath (`/Food-App/` on GitHub Pages), and
 * expo-router has to know that at build time so the links it writes resolve.
 *
 * Setting it here rather than in app.json keeps native builds untouched — no
 * env var, no base URL, exactly as before.
 *
 *     EXPO_WEB_BASE_URL=/Food-App npx expo export --platform web
 */
const appJson = require('./app.json');

module.exports = () => {
  const baseUrl = process.env.EXPO_WEB_BASE_URL;

  return {
    ...appJson.expo,
    experiments: {
      ...(appJson.expo.experiments ?? {}),
      ...(baseUrl ? { baseUrl } : {}),
    },
  };
};
