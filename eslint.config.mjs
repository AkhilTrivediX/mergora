import mergoraConfig from "@mergora/eslint-config";

export default [
  {
    ignores: [
      "**/.next/**",
      "**/.codex-runs/**",
      "**/.turbo/**",
      "**/artifacts/**",
      "**/coverage/**",
      "**/dist/**",
      "**/node_modules/**",
      "**/out/**",
      "**/playwright-report/**",
      "**/storybook-static/**",
      "**/test-results/**",
      "PLANS/**",
      "docs/**",
    ],
  },
  ...mergoraConfig,
];
