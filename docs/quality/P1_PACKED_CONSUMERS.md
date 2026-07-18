# P1 packed external consumers

This proof is the P1 distribution boundary for `P1-024`. It packs the exact unreleased CLI,
executable contracts, plan-only MCP server, Semantic Sync registry runtime, UI, tokens, and schema
workspaces, then installs the same seven tarballs into fresh projects created under the operating system's temporary
directory, outside the Mergora monorepo. No consumer dependency uses `workspace:`, `catalog:`,
`link:`, or a monorepo path.

Run the complete matrix with Node 24.12.0 and Corepack:

```text
pnpm test:consumer
```

The underlying command is `node scripts/verify-p1-consumers.mjs`. It compares the result with
[`../../tests/packed-consumers/evidence.json`](../../tests/packed-consumers/evidence.json). An
intentional artifact or fixture change is reviewed by running the same command with
`--write-evidence`, inspecting the digest delta, and rerunning the default verification.

Both root commands `pnpm test:consumer` and `pnpm pack:all` run that complete matrix. The narrower
`verify-workspace.mjs --gate consumer|pack` probes only that the concrete runner, exact matrix, root
wiring, and deterministic evidence exist; it does not recursively launch the long-running suite.
The unreleased `release:verify` command remains fail closed until the later release matrix exists.

## Matrix

| Consumer     | Distribution path  | Required production result                              |
| ------------ | ------------------ | ------------------------------------------------------- |
| Next package | UI public subpaths | Next 16.2.10 App Router static export at `/mergora-p1/` |
| Next source  | packed CLI `add`   | Next 16.2.10 App Router static export at `/mergora-p1/` |
| Vite package | UI public subpaths | Vite 8.1.5 production bundle at `/mergora-p1/`          |
| Vite source  | packed CLI `add`   | Vite 8.1.5 production bundle at `/mergora-p1/`          |

Every project installs React 19.2.7, React DOM 19.2.7, Tailwind CSS 4.3.3, TypeScript 6.0.3, and the
exact framework and type dependencies recorded in
[`../../tests/packed-consumers/matrix.json`](../../tests/packed-consumers/matrix.json). Source mode
executes the installed binary file from the packed CLI rather than a workspace entry point or a
package-manager shim that can be rewritten by the dependency sub-transaction:

```text
node node_modules/mergora/dist/bin.js init --cwd . --yes --non-interactive --json
node node_modules/mergora/dist/bin.js add button dialog combobox --root . --target src/components --yes --non-interactive --json
```

The three direct requests currently resolve to Button, Combobox, Slot, Layer Manager, Direction,
Provider, and Dialog. The runner derives that closure and its file count from generated native
source payloads, so adding a canonical dependency cannot silently leave this proof on a stale
three-template assumption.

Package mode imports `mergora-ui/button`, `mergora-ui/dialog`, and
`mergora-ui/combobox`, including their public CSS subpaths. Both modes import runtime token and
schema APIs so those packed artifacts participate in typechecking and bundling rather than merely
appearing in `package.json`. Both modes also install the exact `mergora-contracts` tarball used by
the packed CLI audit runtime; the runner verifies its declaration/runtime entry points and both
versioned schemas. The exact `mergora-registry` tarball supplies the CLI's deterministic Semantic
Sync adapters; its runtime and declaration entry points are verified independently of the workspace.
The exact `mergora-mcp` tarball is imported from each frozen external consumer and must expose 20
tools, three resources, and `applyCapability: false`; this proves that its public runtime remains
read/plan-only without relying on workspace resolution.

## Fail-closed checks

For each project the runner:

1. seeds exact public dependencies and writes a lockfile;
2. runs the packed CLI and verifies its package-version surface;
3. in source mode, verifies the exact generated seven-item, 29-file path-only ownership manifest
   and React Aria 1.19.0 patch;
4. removes `node_modules`, then performs an offline install with the frozen lockfile;
5. resolves every Mergora package inside the external project's own `node_modules`;
6. rejects local dependency protocols, install lifecycle scripts, monorepo paths, or missing public
   exports/assets;
7. imports the packed MCP runtime and verifies its exact non-applying capability surface;
8. runs strict TypeScript and a production framework build; and
9. inspects the output for Button, Dialog, Combobox, semantic-token CSS, and the non-root base path.

The runner always validates its temporary root before recursive cleanup. Logs substitute
`<workspace>` and `<temporary>` for absolute paths, and the evidence file contains no timestamp,
host path, or platform-specific temporary directory.

## Evidence boundary and limitations

The tracked evidence binds the raw SHA-256 digest and filename of each exact tarball to four passing
consumer records. The current record was refreshed by one complete clean run and then matched by two
complete comparison runs. `publicationStatus` remains `unreleased`; this P1 evidence is not npm
publication, provenance, or a Stable-maturity claim.

The proof covers fresh source/package installation, offline reproducibility from the seeded store,
types, exports, framework boundaries, CSS inclusion, and production compilation. Browser
interaction, assistive-technology review, the full Semantic Sync update/conflict/rollback workflow,
React 18.3 compatibility, other package managers and operating systems, and public npm provenance
remain separate roadmap gates.
