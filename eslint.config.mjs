import js from '@eslint/js';
import jupyterPlugin from '@jupyter/eslint-plugin';
import { DEFAULT_LONG_LIVED_TYPES } from '@jupyter/eslint-plugin/lib/utils/signal-lifetime.js';
import prettierRecommended from 'eslint-plugin-prettier/recommended';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const jupyterRecommended = jupyterPlugin.configs.recommended.map(config => ({
  ...config,
  plugins: {
    jupyter: jupyterPlugin,
    ...config.plugins
  }
}));

// The settings object is loaded once in `activate` and shared by every
// notebook, so it outlives the widgets which connect to its signals.
const longLivedTypes = [...DEFAULT_LONG_LIVED_TYPES, 'ISettings'];

export default defineConfig([
  {
    ignores: [
      'node_modules',
      'dist',
      'coverage',
      '**/*.d.ts',
      'jupyterlab_execute_time',
      'ui-tests',
      'lib'
    ]
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...jupyterRecommended,
  {
    files: ['src/**/*.ts', 'tests/**/*.ts'],
    plugins: {
      jupyter: jupyterPlugin
    },
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.es2020,
        ...globals.node
      },
      parserOptions: {
        project: ['tsconfig.json', 'tests/tsconfig.json'],
        sourceType: 'module'
      }
    },
    rules: {
      '@typescript-eslint/naming-convention': [
        'error',
        {
          selector: 'interface',
          format: ['PascalCase'],
          custom: {
            regex: '^I[A-Z]',
            match: true
          }
        }
      ],
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-namespace': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { args: 'none' }],
      '@typescript-eslint/no-use-before-define': 'off',
      curly: ['error', 'all'],
      eqeqeq: 'error',
      'jupyter/no-untranslated-string': 'off',
      'jupyter/prefer-signal-this-arg': ['error', { longLivedTypes }],
      'jupyter/require-disposable-ownership': 'error',
      'jupyter/require-disposable-transfer': 'error',
      'jupyter/require-signal-cleanup': ['error', { longLivedTypes }],
      'prefer-arrow-callback': 'error'
    }
  },
  prettierRecommended
]);
