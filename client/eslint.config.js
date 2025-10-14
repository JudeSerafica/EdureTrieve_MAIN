import js from "@eslint/js";

export default [
  js.configs.recommended,
  {
    files: ["src/**/*.{js,jsx}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
    },
    rules: {
      "react-hooks/exhaustive-deps": "warn", // or "off" kung ayaw mo ng warning
    },
  },
];
