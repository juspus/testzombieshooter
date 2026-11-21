// ESLint flat config: a linter for real bugs, not style (no Prettier, no formatting rules).
//
// "Existing code gets warnings, new code gets errors."
//   npm run lint          whole repo, every problem is a WARNING, exit 0 (a report).
//   npm run lint:changed  strict: every problem is an ERROR, but only problems on lines the
//                         branch added or changed count (scripts/lint-changed.cjs). CI runs this.
// Strictness is switched by LINT_STRICT=1, read below.
import globals from 'globals'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'

const level = process.env.LINT_STRICT ? 'error' : 'warn'

const rules = {
  // Hooks: the stale-closure and wrong-order bugs agents are most likely to write.
  'react-hooks/rules-of-hooks': level,
  'react-hooks/exhaustive-deps': level,
  // Undefined and unused names.
  'no-undef': level,
  'no-unused-vars': [level, {
    args: 'after-used',
    argsIgnorePattern: '^_',
    varsIgnorePattern: '^_',
    caughtErrors: 'none',
    ignoreRestSiblings: true,
  }],
  // JSX awareness: mark components and variables used only in JSX as used, flag undefined components.
  'react/jsx-uses-vars': level,
  'react/jsx-uses-react': 'off', // automatic JSX runtime
  'react/jsx-no-undef': level,
  // Cheap, high-signal bug catchers from eslint:recommended (the noisy style-ish ones stay off).
  'no-dupe-keys': level,
  'no-dupe-else-if': level,
  'no-duplicate-case': level,
  'no-unreachable': level,
  'no-self-assign': level,
  'no-const-assign': level,
  'no-func-assign': level,
  'no-import-assign': level,
  'no-redeclare': level,
  'use-isnan': level,
  'valid-typeof': level,
  'no-unsafe-negation': level,
  'no-cond-assign': [level, 'except-parens'],
}

export default [
  { ignores: ['dist/**', 'node_modules/**', '.claude/**', '.agents/**', 'coverage/**', 'public/**'] },
  {
    files: ['**/*.{js,jsx,mjs}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: { react, 'react-hooks': reactHooks },
    settings: { react: { version: '18.3' } },
    rules,
  },
  {
    // Node CommonJS scripts (Playwright smoke tests etc.).
    files: ['**/*.cjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'commonjs',
      globals: { ...globals.browser, ...globals.node },
    },
    rules: Object.fromEntries(Object.entries(rules).filter(([k]) => !k.startsWith('react'))),
  },
  {
    // Vitest runs with globals: true.
    files: ['**/__tests__/**', '**/*.test.{js,jsx}', 'src/test-setup.js'],
    languageOptions: { globals: { ...globals.vitest, vi: 'readonly' } },
  },
]
