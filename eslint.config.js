// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const prettierConfig = require('eslint-config-prettier');

module.exports = defineConfig([
  expoConfig,
  prettierConfig,
  {
    ignores: [
      'dist/*',
      '.expo/*',
      'node_modules/*',
      'supabase/functions/*',
      'coverage/*',
      // A separate Vite web project with its own toolchain.
      'popspot/*',
    ],
  },
  {
    rules: {
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'import/no-unresolved': 'off',
    },
  },
  {
    /**
     * No user-facing English outside the localisation layer.
     *
     * The Arabic build was reported "complete" on 468/468 translated keys
     * while the rendered app still showed English, because the English was
     * never a key: it was written straight into a component — search examples,
     * unit labels, expiry presets, filter chips. A dictionary check cannot see
     * those. This can.
     *
     * It matches a literal string with letters in it reaching a prop that ends
     * up in front of a user. Anything genuinely language-neutral (a testID, an
     * icon name, a currency code) is not in the list; anything that has to be
     * literal takes an eslint-disable with a reason.
     */
    files: ['src/**/*.tsx'],
    ignores: ['src/**/__tests__/**', 'src/i18n/**'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            'JSXAttribute[name.name=/^(label|title|subtitle|body|placeholder|hint|message|accessibilityLabel|accessibilityHint|clearLabel|confirmLabel|cancelLabel)$/] > Literal[value=/[A-Za-z]{2}/]',
          message:
            'User-facing text must come from the translation dictionary: use t(\'some.key\') rather than a literal string.',
        },
        {
          selector: 'JSXText[value=/[A-Za-z]{3}/]',
          message:
            'User-facing text must come from the translation dictionary: use {t(\'some.key\')} rather than literal text.',
        },
      ],
    },
  },
  {
    // Jest's module factories must be lazy, which `require()` is and `import`
    // is not — the mock has to be constructed at call time, after hoisting.
    files: ['jest.setup.ts', '**/__mocks__/**'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    // Build scripts are Node programs, not React Native code: they have Node
    // globals and printing to stdout is their entire output contract.
    files: ['scripts/**/*.{ts,mjs,js}'],
    languageOptions: {
      globals: {
        Buffer: 'readonly',
        process: 'readonly',
        console: 'readonly',
        __dirname: 'readonly',
      },
    },
    rules: {
      'no-console': 'off',
      'no-undef': 'off',
    },
  },
]);
