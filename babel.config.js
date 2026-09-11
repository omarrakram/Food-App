/**
 * Babel configuration.
 *
 * Expo infers this when it is absent, but Jest's web project does not: its
 * preset replaces the transform options wholesale and keeps only the caller,
 * so without a real config file on disk there is no TypeScript preset and
 * every `.ts` file fails to parse. Writing it out keeps Metro, the native Jest
 * project and the web Jest project on exactly one configuration.
 */
module.exports = function babelConfig(api) {
  api.cache(true);
  return { presets: ['babel-preset-expo'] };
};
