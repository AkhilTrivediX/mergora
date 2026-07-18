import mergoraConfig from "@mergora/eslint-config";

export default [
  {
    ignores: [
      "**/.next/**",
      "**/.turbo/**",
      "**/coverage/**",
      "**/dist/**",
      "**/node_modules/**",
      "**/out/**",
      "**/playwright-report/**",
      "**/storybook-static/**",
      "PLANS/**",
      "docs/**",
    ],
  },
  ...mergoraConfig,
];
