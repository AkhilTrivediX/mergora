import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { validateSchemaDocument } from "../../../registry/schemas/index.ts";
import {
  AdminDashboardShell,
  createDeterministicAdminDashboardShellAdapter,
} from "../../../registry/source/kits/admin-dashboard-shell/index.ts";
import {
  CommandCenter,
  createDeterministicCommandCenterAdapter,
} from "../../../registry/source/kits/command-center/index.ts";
import {
  CrudDataWorkspace,
  createDeterministicCrudDataWorkspaceAdapter,
} from "../../../registry/source/kits/crud-data-workspace/index.ts";
import {
  assertImplementationProfileShard,
  loadMergoraSignaturePolicy,
} from "../../../tooling/registry-builder/src/index.ts";

const workspaceRoot = resolve(import.meta.dirname, "../../..");
const kitIds = ["admin-dashboard-shell", "command-center", "crud-data-workspace"] as const;

describe("workflow operations kits", () => {
  it("keeps every optional enhancement absent from basic server markup", () => {
    const html = renderToStaticMarkup(
      <>
        <AdminDashboardShell adapter={createDeterministicAdminDashboardShellAdapter()} />
        <CommandCenter
          adapter={createDeterministicCommandCenterAdapter()}
          defaultQuery="component"
        />
        <CrudDataWorkspace adapter={createDeterministicCrudDataWorkspaceAdapter()} />
      </>,
    );
    expect(html).not.toContain("admin-dashboard-role-context");
    expect(html).not.toContain("admin-dashboard-notifications");
    expect(html).not.toContain("command-center-result-count");
    expect(html).not.toContain("Ctrl/⌘ K");
    expect(html).not.toContain("crud-data-workspace-bulk-actions");
    expect(html).not.toContain("crud-data-workspace-save-view");
    expect(html).not.toContain("crud-data-workspace-mutation-timeline");
  });

  it("provides deterministic, abort-aware fixture adapters without external requests", async () => {
    const controller = new AbortController();
    const dashboard = await createDeterministicAdminDashboardShellAdapter().load(
      "analyst",
      controller.signal,
    );
    expect(dashboard.activities).toHaveLength(3);
    expect(dashboard.trend.map((point) => point.value)).toEqual([18, 24, 21, 31, 28]);

    const command = createDeterministicCommandCenterAdapter();
    expect((await command.search("component", controller.signal)).map((item) => item.id)).toEqual([
      "open-catalog",
    ]);
    expect((await command.loadRecent?.(controller.signal))?.map((item) => item.group)).toEqual([
      "Recent",
      "Recent",
    ]);

    const crud = createDeterministicCrudDataWorkspaceAdapter();
    const initial = await crud.load(controller.signal);
    const created = await crud.create(
      { category: "Evidence", name: "Contrast review", status: "draft" },
      controller.signal,
    );
    const updated = await crud.update(
      created.id,
      { category: "Evidence", name: "Contrast review", status: "active" },
      controller.signal,
    );
    expect(updated.status).toBe("active");
    await crud.delete(created.id, controller.signal);
    expect((await crud.load(controller.signal)).records).toHaveLength(initial.records.length);
    await crud.restore?.(created, controller.signal);
    expect(
      (await crud.load(controller.signal)).records.some((record) => record.id === created.id),
    ).toBe(true);

    const aborted = new AbortController();
    aborted.abort();
    await expect(command.search("component", aborted.signal)).rejects.toMatchObject({
      name: "AbortError",
    });
  });

  it("validates metadata, exact source imports, companion stories, and semantic CSS", () => {
    const tokens = readFileSync(
      resolve(workspaceRoot, "packages/tokens/src/generated/tokens.css"),
      "utf8",
    );
    const storySource = readFileSync(
      resolve(workspaceRoot, "apps/storybook/src/P6WorkflowKits.stories.tsx"),
      "utf8",
    );
    for (const id of kitIds) {
      const directory = resolve(workspaceRoot, "registry/source/kits", id);
      const metadata = JSON.parse(readFileSync(resolve(directory, `${id}.metadata.json`), "utf8"));
      expect(validateSchemaDocument("component-metadata", metadata), id).toMatchObject({
        ok: true,
      });

      const manifest = JSON.parse(
        readFileSync(resolve(directory, `${id}.source.json`), "utf8"),
      ) as { readonly declaredImports: readonly string[]; readonly entryPath: string };
      const entry = readFileSync(resolve(workspaceRoot, manifest.entryPath), "utf8");
      const actualImports = [
        ...new Set(
          [...entry.matchAll(/(?:\bfrom\s*|\bimport\s*)["']([^"']+)["']/gu)].map(
            (match) => match[1]!,
          ),
        ),
      ].sort((left, right) => left.localeCompare(right, "en-US"));
      expect(manifest.declaredImports, id).toEqual(actualImports);

      const stories = JSON.parse(
        readFileSync(resolve(directory, `${id}.stories.json`), "utf8"),
      ) as { readonly states: readonly { readonly story: string }[] };
      for (const state of stories.states) {
        expect(storySource, `${id}:${state.story}`).toContain(`export const ${state.story}:`);
      }

      const css = readFileSync(resolve(directory, `${id}.css`), "utf8");
      const references = [...css.matchAll(/var\((--mrg-semantic-[a-z0-9-]+)/gu)].map(
        (match) => match[1]!,
      );
      expect(references.length, id).toBeGreaterThan(12);
      expect(
        references.every((token) => tokens.includes(`${token}:`)),
        id,
      ).toBe(true);
      expect(css, id).toContain("@media (forced-colors: active)");
      expect(css, id).toContain("@media (prefers-reduced-motion: reduce)");
      expect(css, id).not.toMatch(
        /(?:gradient\(|backdrop-filter|border-radius:\s*(?:2[0-9]|[3-9][0-9])px)/u,
      );
    }
  });

  it("validates complete and honestly immature implementation profiles", () => {
    const policy = loadMergoraSignaturePolicy(workspaceRoot);
    for (const filename of [
      "admin-dashboard.v1.json",
      "command-search.v1.json",
      "crud-data.v1.json",
    ]) {
      const shard = JSON.parse(
        readFileSync(
          resolve(workspaceRoot, "registry/quality/implementation-profiles", filename),
          "utf8",
        ),
      );
      expect(() => assertImplementationProfileShard(shard, policy, workspaceRoot)).not.toThrow();
      expect(shard.auditPendingIds).toEqual([]);
      expect(shard.profiles).toHaveLength(1);
      expect(shard.profiles[0].maturityAssessment.status).toBe("not-ready");
    }
  });
});
