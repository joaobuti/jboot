import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import prettierConfig from "eslint-config-prettier";
import prettier from "eslint-plugin-prettier";

/** @type {import("eslint").Linter.Config[]} */
const eslintConfig = [
  {
    ignores: [".next/**", "node_modules/**", "out/**", "dist/**", "coverage/**"],
  },
  ...nextVitals,
  ...nextTypescript,
  prettierConfig,
  {
    files: ["**/*.{ts,tsx,js,jsx}"],
    plugins: {
      prettier,
    },
    rules: {
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/explicit-module-boundary-types": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-unused-expressions": "off",
      "no-var": "off",
      "prefer-const": "off",
      "no-unused-vars": "off",
      "react/no-unescaped-entities": "off",
      "react/jsx-no-duplicate-props": "off",
      "@next/next/no-html-link-for-pages": "off",
      "react-hooks/exhaustive-deps": "off",
      "prettier/prettier": "error",
    },
  },
];

export default eslintConfig;
