import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { validateSchemaDocument } from "../../../registry/schemas/index.ts";
import {
  AuditLog,
  createAuditLogCsv,
} from "../../../registry/source/components/audit-log/audit-log.tsx";
import { ChatComposer } from "../../../registry/source/components/chat-composer/chat-composer.tsx";
import {
  Citation,
  isSafeCitationUrl,
} from "../../../registry/source/components/citation/citation.tsx";
import {
  CollaborationPresence,
  getCollaborationPresenceStatus,
} from "../../../registry/source/components/collaboration-presence/collaboration-presence.tsx";
import { CommentThread } from "../../../registry/source/components/comment-thread/comment-thread.tsx";
import { Message } from "../../../registry/source/components/message/message.tsx";
import { MessageList } from "../../../registry/source/components/message-list/message-list.tsx";
import { PromptSuggestions } from "../../../registry/source/components/prompt-suggestions/prompt-suggestions.tsx";
import { Reasoning } from "../../../registry/source/components/reasoning/reasoning.tsx";
import {
  appendStreamingTextSegment,
  StreamingText,
} from "../../../registry/source/components/streaming-text/streaming-text.tsx";
import {
  redactToolText,
  ToolCall,
} from "../../../registry/source/components/tool-call/tool-call.tsx";
import { createDeterministicAiChatWorkspaceAdapter } from "../../../registry/source/kits/ai-chat-workspace/ai-chat-workspace-adapter.ts";
import {
  assertImplementationProfileShard,
  loadMergoraSignaturePolicy,
} from "../../../tooling/registry-builder/src/index.ts";

const workspaceRoot = resolve(import.meta.dirname, "../../..");
const componentIds = [
  "audit-log",
  "chat-composer",
  "citation",
  "collaboration-presence",
  "comment-thread",
  "message",
  "message-list",
  "prompt-suggestions",
  "reasoning",
  "streaming-text",
  "tool-call",
] as const;

describe("AI and collaboration canonical family", () => {
  it("keeps enhancement DOM and accessibility output absent in basic rendering", () => {
    const html = renderToStaticMarkup(
      <>
        <Message role="assistant">Plain response</Message>
        <StreamingText segments={[{ id: "one", text: "Plain text" }]} />
        <MessageList
          getItemId={(item: { readonly id: string }) => item.id}
          items={[]}
          label="Messages"
          renderItem={() => null}
        />
        <ChatComposer label="Message" />
        <PromptSuggestions label="Suggestions" suggestions={[]} />
        <Citation href="/docs" number={1} title="Documentation" />
        <Reasoning summary="Summary">Details</Reasoning>
        <ToolCall name="Local tool" status="success" />
        <CommentThread comments={[]} label="Thread" />
        <CollaborationPresence label="People" people={[]} />
        <AuditLog events={[]} label="Audit log" />
      </>,
    );
    expect(html).not.toContain("message-role-context");
    expect(html).not.toContain("streaming-text-announcement");
    expect(html).not.toContain("message-list-follow");
    expect(html).not.toContain("message-list-announcement");
    expect(html).not.toContain("chat-composer-attachments");
    expect(html).not.toContain("chat-composer-budget");
    expect(html).not.toContain('role="listbox"');
    expect(html).not.toContain("citation-source-detail");
    expect(html).not.toContain("reasoning-progress");
    expect(html).not.toContain("reasoning-announcement");
    expect(html).not.toContain("tool-call-details");
    expect(html).not.toContain("comment-thread-mentions");
    expect(html).not.toContain("collaboration-presence-summary");
    expect(html).not.toContain("audit-log-filters");
    expect(html).not.toContain("audit-log-export");
  });

  it("fails citation URLs closed and protects spreadsheet exports", () => {
    expect(isSafeCitationUrl("/quality/button")).toBe(true);
    expect(isSafeCitationUrl("https://example.com/source")).toBe(true);
    expect(isSafeCitationUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeCitationUrl("//evil.example/source")).toBe(false);
    expect(isSafeCitationUrl("/\\evil.example/source")).toBe(false);
    expect(isSafeCitationUrl("https://user:secret@example.com/")).toBe(false);
    const unsafe = renderToStaticMarkup(
      <Citation href="javascript:alert(1)" number={2} title="Unsafe" />,
    );
    expect(unsafe).not.toContain("href=");
    const csv = createAuditLogCsv([
      {
        action: "updated",
        actor: '=HYPERLINK("https://evil.example")',
        details: "+SUM(1,1)",
        id: "event",
        object: "@command",
        timestamp: "2026-01-15T10:00:00Z",
      },
    ]);
    expect(csv).toContain("'=HYPERLINK");
    expect(csv).toContain("'+SUM");
    expect(csv).toContain("'@command");
  });

  it("preserves stable stream ids and redacts tool output", () => {
    const segments = appendStreamingTextSegment([], { id: "first", text: "First" });
    expect(appendStreamingTextSegment(segments, { id: "second", text: " second" })).toHaveLength(2);
    expect(() => appendStreamingTextSegment(segments, { id: "first", text: "duplicate" })).toThrow(
      /not unique/u,
    );
    expect(redactToolText("token=secret; safe", ["secret"])).toBe("token=[redacted]; safe");
    const hidden = renderToStaticMarkup(
      <ToolCall
        name="Read record"
        showDetails={{ output: "private-value", sensitive: true }}
        status="success"
      />,
    );
    expect(hidden).toContain("Sensitive value hidden");
    expect(hidden).not.toContain("private-value");
    const controlledWithoutPermission = renderToStaticMarkup(
      <ToolCall
        name="Read record"
        sensitiveRevealed
        showDetails={{ output: "private-value", sensitive: true }}
        status="success"
      />,
    );
    expect(controlledWithoutPermission).toContain("Sensitive value hidden");
    expect(controlledWithoutPermission).not.toContain("private-value");
  });

  it("keeps the plain composer a native form without shortcut output", () => {
    const html = renderToStaticMarkup(
      <ChatComposer defaultValue="Draft" label="Message" name="message" submitShortcut={false} />,
    );
    expect(html).toContain("<form");
    expect(html).toContain('name="message"');
    expect(html).toContain(">Draft</textarea>");
    expect(html).not.toContain("chat-composer-shortcut");
  });

  it("adds listbox semantics atomically only when selection mode is enabled", () => {
    const enhanced = renderToStaticMarkup(
      <PromptSuggestions
        label="Suggestions"
        selectedKey="two"
        selectionMode
        suggestions={[
          { id: "one", label: "One", textValue: "One" },
          { id: "two", label: "Two", textValue: "Two" },
        ]}
      />,
    );
    const basic = renderToStaticMarkup(
      <PromptSuggestions
        label="Suggestions"
        suggestions={[{ id: "one", label: "One", textValue: "One" }]}
      />,
    );
    expect(enhanced).toContain('role="listbox"');
    expect(enhanced).toContain('role="option"');
    expect(enhanced).toContain('aria-selected="true"');
    expect(basic).not.toContain('role="listbox"');
    expect(basic).not.toContain('role="option"');
    expect(basic).not.toContain("aria-selected");
  });

  it("derives stale presence from an explicit clock", () => {
    expect(
      getCollaborationPresenceStatus(
        {
          id: "person",
          lastActive: "2026-01-15T09:00:00Z",
          name: "Asha",
          status: "available",
        },
        { afterMilliseconds: 15 * 60 * 1000, now: "2026-01-15T10:00:00Z" },
      ),
    ).toBe("stale");
  });

  it("provides a deterministic, provider-neutral fake adapter", async () => {
    const adapter = createDeterministicAiChatWorkspaceAdapter();
    const controller = new AbortController();
    const first = await adapter.load(controller.signal);
    const second = await adapter.load(controller.signal);
    expect(first).toEqual(second);
    expect(first.conversations).toHaveLength(2);
    const output = adapter.send(
      { attachments: [], conversationId: "component-review", text: "Review" },
      controller.signal,
    );
    expect(Symbol.asyncIterator in output).toBe(true);
    const updates = [];
    if (Symbol.asyncIterator in output) {
      for await (const update of output) updates.push(update);
    }
    expect(updates).toHaveLength(2);
    expect(updates[1]?.segments).toHaveLength(2);
    expect(updates[1]?.toolCalls?.[0]?.status).toBe("success");
  });

  it("uses declared semantic tokens and preference fallbacks", () => {
    const tokens = readFileSync(
      resolve(workspaceRoot, "packages/tokens/src/generated/tokens.css"),
      "utf8",
    );
    for (const id of componentIds) {
      const css = readFileSync(
        resolve(workspaceRoot, `registry/source/components/${id}/${id}.css`),
        "utf8",
      );
      const references = [...css.matchAll(/var\((--mrg-semantic-[a-z0-9-]+)/gu)].map(
        (match) => match[1]!,
      );
      expect(references.length, id).toBeGreaterThan(5);
      expect(
        references.every((token) => tokens.includes(`${token}:`)),
        id,
      ).toBe(true);
      expect(css, id).toContain("@media (forced-colors: active)");
      expect(css, id).not.toMatch(
        /(?:gradient\(|backdrop-filter|border-radius:\s*(?:2[0-9]|[3-9][0-9])px)/u,
      );
    }
  });

  it("validates every component and kit metadata companion", () => {
    const paths = [
      ...componentIds.map((id) =>
        resolve(workspaceRoot, "registry/source/components", id, `${id}.metadata.json`),
      ),
      resolve(
        workspaceRoot,
        "registry/source/kits/ai-chat-workspace/ai-chat-workspace.metadata.json",
      ),
    ];
    for (const path of paths) {
      const result = validateSchemaDocument(
        "component-metadata",
        JSON.parse(readFileSync(path, "utf8")),
      );
      expect(result.errors, path).toEqual([]);
      expect(result.ok, path).toBe(true);
    }
  });

  it("keeps source descriptors and Storybook state references exact", () => {
    const itemDirectories = [
      ...componentIds.map((id) => ({
        directory: resolve(workspaceRoot, "registry/source/components", id),
        id,
      })),
      {
        directory: resolve(workspaceRoot, "registry/source/kits/ai-chat-workspace"),
        id: "ai-chat-workspace",
      },
    ];
    const storySource = readFileSync(
      resolve(workspaceRoot, "apps/storybook/src/P5AiCollaboration.stories.tsx"),
      "utf8",
    );
    for (const { directory, id } of itemDirectories) {
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
    }
  });

  it("validates complete, honest implementation-profile shards", () => {
    const policy = loadMergoraSignaturePolicy(workspaceRoot);
    for (const filename of ["ai-collaboration.v1.json", "ai-chat.v1.json"]) {
      const shard = JSON.parse(
        readFileSync(
          resolve(workspaceRoot, "registry/quality/implementation-profiles", filename),
          "utf8",
        ),
      );
      expect(() => assertImplementationProfileShard(shard, policy, workspaceRoot)).not.toThrow();
      expect(shard.auditPendingIds).toEqual([]);
      expect(
        shard.profiles.every(
          (profile: { readonly maturityAssessment: { readonly status: string } }) =>
            profile.maturityAssessment.status === "not-ready",
        ),
      ).toBe(true);
    }
  });
});
