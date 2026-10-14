import eslint from '@eslint/js';
import eslintConfigPrettier from 'eslint-config-prettier';
import playwright from 'eslint-plugin-playwright';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const TYPESCRIPT_FILES = ['**/*.ts'];

// The type-aware rule sets ship without file scoping, so they would also be
// applied to plain JavaScript files, where no type information can be built.
const scopeToTypeScript = (configs) =>
  configs.map((config) => ({ ...config, files: TYPESCRIPT_FILES }));

export default tseslint.config(
  {
    ignores: [
      'node_modules/**',
      'test-results/**',
      'playwright-report/**',
      'blob-report/**',
      'downloads/**',
      'pnpm-lock.yaml',
    ],
  },
  {
    files: ['**/*.{js,mjs}'],
    extends: [eslint.configs.recommended],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  {
    files: TYPESCRIPT_FILES,
    extends: [eslint.configs.recommended],
    languageOptions: {
      globals: { ...globals.node },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  ...scopeToTypeScript(tseslint.configs.strictTypeChecked),
  ...scopeToTypeScript(tseslint.configs.stylisticTypeChecked),
  {
    files: ['e2e/**/*.ts'],
    ...playwright.configs['flat/recommended'],
  },
  eslintConfigPrettier,
);
