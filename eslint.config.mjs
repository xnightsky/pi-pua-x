import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.ts"],
    languageOptions: {
      parserOptions: {
        project: "./tsconfig.json",
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // 项目当前风格：允许显式 any（与 strict: false 对齐）
      "@typescript-eslint/no-explicit-any": "off",
      // 允许 require 风格（部分兼容场景）
      "@typescript-eslint/no-require-imports": "off",
      // 项目大量静默容错 catch，允许空 catch 块
      "no-empty": ["error", { "allowEmptyCatch": true }],
    },
  },
  {
    ignores: ["node_modules/", "bin/"],
  }
);
