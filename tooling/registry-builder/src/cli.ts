import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { findWorkspaceRoot, runWorkspaceGeneration } from "./workspace.ts";

const requestedMode = process.argv.slice(2);
if (
  requestedMode.length !== 1 ||
  (requestedMode[0] !== "--write" && requestedMode[0] !== "--check")
) {
  console.error("Usage: node tooling/registry-builder/src/cli.ts --write|--check");
  process.exitCode = 2;
} else {
  const mode = requestedMode[0] === "--write" ? "write" : "check";
  const workspaceRoot = findWorkspaceRoot(dirname(fileURLToPath(import.meta.url)));
  const result = await runWorkspaceGeneration(workspaceRoot, mode);
  if (!result.ok) {
    result.issues.forEach((issue) => console.error(`${issue.code}: ${issue.path}`));
    console.error("Generated artifacts are out of date. Run the write-mode generator.");
    process.exitCode = 1;
  } else {
    console.log(
      mode === "write"
        ? `Generated ${result.files.length} deterministic artifacts.`
        : `Verified ${result.files.length} deterministic artifacts.`,
    );
  }
}
