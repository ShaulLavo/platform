import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.ts'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2023,
      globals: {
        ...globals.node,
        Bun: 'readonly',
      },
      parserOptions: {
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Requirement 3.5: `isRecord` is owned by `@workspace/contracts` and must
      // not be redefined locally. The canonical declaration lives in
      // `packages/contracts/src/is-record.ts`; everything else must import it
      // from `@workspace/contracts`.
      'no-restricted-syntax': [
        'error',
        {
          selector: 'FunctionDeclaration[id.name="isRecord"]',
          message:
            'Do not redefine `isRecord`. Import it from `@workspace/contracts` instead.',
        },
        {
          selector: 'VariableDeclarator[id.name="isRecord"]',
          message:
            'Do not redefine `isRecord`. Import it from `@workspace/contracts` instead.',
        },
      ],
    },
  },
])
