import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import jsxA11y from 'eslint-plugin-jsx-a11y'
import tseslint from 'typescript-eslint'
import prettier from 'eslint-config-prettier'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores([
    'dist',
    'dev-dist',
    'coverage',
    'playwright-report',
    'test-results',
    '.opencode',
    'scripts',
  ]),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
      jsxA11y.flatConfigs.recommended,
      prettier,
    ],
    languageOptions: {
      ecmaVersion: 'latest',
      globals: globals.browser,
    },
    rules: {
      // architecture.md §9: React escapes by default; these sinks are banned.
      'no-restricted-syntax': [
        'error',
        {
          selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
          message: 'dangerouslySetInnerHTML is banned (architecture.md §9).',
        },
      ],
      'no-restricted-properties': [
        'error',
        { property: 'innerHTML', message: 'Use React children (architecture.md §9).' },
        { property: 'outerHTML', message: 'Direct HTML sinks are banned (architecture.md §9).' },
        {
          property: 'insertAdjacentHTML',
          message: 'Direct HTML sinks are banned (architecture.md §9).',
        },
      ],
      'no-restricted-globals': ['error', { name: 'eval', message: 'eval is banned.' }],
    },
  },
])
