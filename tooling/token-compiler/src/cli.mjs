#!/usr/bin/env node

import { compileWorkspace } from "./compiler.mjs";

const argumentsSet = new Set(process.argv.slice(2));
if (argumentsSet.has("--help")) {
  process.stdout.write(
    [
      "Mergora deterministic DTCG 2025.10 compiler",
      "",
      "  --write  validate and update generated artifacts",
      "  --check  validate and fail when generated artifacts drift (default)",
      "",
    ].join("\n"),
  );
  process.exit(0);
}

const unknown = [...argumentsSet].filter(
  (argument) => argument !== "--write" && argument !== "--check",
);
if (unknown.length > 0 || (argumentsSet.has("--write") && argumentsSet.has("--check"))) {
  process.stderr.write(`Invalid token compiler arguments: ${[...argumentsSet].join(" ")}\n`);
  process.exit(2);
}

try {
  const mode = argumentsSet.has("--write") ? "write" : "check";
  const result = compileWorkspace({ mode });
  const action = mode === "write" ? `updated ${result.drift.length}` : "verified";
  process.stdout.write(
    `Mergora tokens ${action}: ${result.tokenCount} tokens, ${result.contexts.size} contexts, ${result.contrastEvidence.length} contrast checks.\n`,
  );
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}
