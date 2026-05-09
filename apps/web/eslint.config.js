import js from "@eslint/js"
import globals from "globals"
import reactHooks from "eslint-plugin-react-hooks"
import reactRefresh from "eslint-plugin-react-refresh"
import tseslint from "typescript-eslint"
import { defineConfig, globalIgnores } from "eslint/config"

export default defineConfig([
  globalIgnores(["dist"]),
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat["recommended-latest"],
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: 'FunctionDeclaration[id.name="isRecord"]',
          message:
            "Do not redefine `isRecord`. Import it from `@workspace/contracts` instead.",
        },
        {
          selector: 'VariableDeclarator[id.name="isRecord"]',
          message:
            "Do not redefine `isRecord`. Import it from `@workspace/contracts` instead.",
        },
      ],
    },
  },
])
