import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import prettier from 'eslint-config-prettier/flat';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import turbo from 'eslint-plugin-turbo';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig(
  globalIgnores(['dist/**', 'coverage/**', '.turbo/**']),
  {
    linterOptions: {
      reportUnusedDisableDirectives: 'error',
    },
  },
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      globals: globals.node,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ['**/*.{js,jsx,mjs,cjs}'],
    extends: [tseslint.configs.disableTypeChecked],
  },
  turbo.configs['flat/recommended'],
  {
    plugins: {
      'simple-import-sort': simpleImportSort,
    },
    rules: {
      'simple-import-sort/imports': 'error',
      'simple-import-sort/exports': 'error',
      'no-duplicate-imports': ['error', { allowSeparateTypeImports: true }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      // Modules, controllers and providers are decorated classes, often with empty bodies.
      '@typescript-eslint/no-extraneous-class': ['error', { allowWithDecorator: true }],
      // Nest DI needs constructor parameter types as runtime values (emitDecoratorMetadata).
      // Auto-fixing them to `import type` would silently break injection.
      '@typescript-eslint/consistent-type-imports': 'off',
    },
  },
  // Must stay last so it turns off every rule that conflicts with Prettier.
  prettier,
);
