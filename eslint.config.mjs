import js from "@eslint/js";
import nextVitals from "eslint-config-next/core-web-vitals";
import prettier from "eslint-config-prettier";
import testingLibrary from "eslint-plugin-testing-library";
import globals from "globals";

export default [
  {
    ignores: [
      ".next/**",
      "coverage/**",
      "dist/**",
      "install/**",
      "node_modules/**",
      "src-tauri/target/**",
    ],
  },
  js.configs.recommended,
  ...nextVitals,
  {
    files: ["**/*.{js,jsx,ts,tsx}"],
    linterOptions: {
      reportUnusedDisableDirectives: "off",
    },
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      "@next/next/no-img-element": "off",
      "react-hooks/exhaustive-deps": "off",
      "react-hooks/immutability": "off",
      "react-hooks/purity": "off",
      "react-hooks/refs": "off",
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/static-components": "off",
    },
  },
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      "no-unused-vars": "off",
    },
  },
  {
    files: ["**/__tests__/**/*.{js,jsx,ts,tsx}", "**/*.{spec,test}.{js,jsx,ts,tsx}"],
    ...testingLibrary.configs["flat/react"],
    languageOptions: {
      globals: globals.jest,
    },
    rules: {
      "testing-library/render-result-naming-convention": "off",
    },
  },
  prettier,
];
