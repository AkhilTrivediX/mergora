import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState, type ReactElement } from "react";

import { AuditLog } from "../../../registry/source/components/audit-log/index.ts";
import { ChatComposer } from "../../../registry/source/components/chat-composer/index.ts";
import { Citation } from "../../../registry/source/components/citation/index.ts";
import { CollaborationPresence } from "../../../registry/source/components/collaboration-presence/index.ts";
import { CommentThread } from "../../../registry/source/components/comment-thread/index.ts";
import { Message } from "../../../registry/source/components/message/index.ts";
import { MessageList } from "../../../registry/source/components/message-list/index.ts";
import { PromptSuggestions } from "../../../registry/source/components/prompt-suggestions/index.ts";
import { Reasoning } from "../../../registry/source/components/reasoning/index.ts";
import { StreamingText } from "../../../registry/source/components/streaming-text/index.ts";
import { ToolCall } from "../../../registry/source/components/tool-call/index.ts";
import {
  AiChatWorkspace,
  createDeterministicAiChatWorkspaceAdapter,
  type AiChatWorkspaceAdapter,
} from "../../../registry/source/kits/ai-chat-workspace/index.ts";
import "mergora-tokens/tokens.css";

type Kind =
  | "ai-chat-workspace"
  | "audit-log"
  | "chat-composer"
  | "citation"
  | "collaboration-presence"
  | "comment-thread"
  | "message"
  | "message-list"
  | "prompt-suggestions"
  | "reasoning"
  | "streaming-text"
  | "tool-call";

interface StoryProps {
  readonly allowSensitiveReveal: boolean;
  readonly announceCompletion: boolean;
  readonly announceMessages: boolean;
  readonly announceUpdates: boolean;
  readonly exportCsv: boolean;
  readonly filtering: boolean;
  readonly followOutput: boolean;
  readonly kind: Kind;
  readonly optimisticReplies: boolean;
  readonly selectionMode: boolean;
  readonly showAttachments: boolean;
  readonly showCharacterBudget: boolean;
  readonly showCursor: boolean;
  readonly showDescriptions: boolean;
  readonly showDetails: boolean;
  readonly showDuration: boolean;
  readonly showMentions: boolean;
  readonly showProgress: boolean;
  readonly showRoleContext: boolean;
  readonly showSourceDetail: boolean;
  readonly showSummary: boolean;
  readonly stalePolicy: boolean;
  readonly submitShortcut: boolean;
  readonly virtualize: boolean;
}

const messages = Array.from({ length: 18 }, (_, index) => ({
  id: `message-${index}`,
  role: index % 3 === 0 ? ("user" as const) : ("assistant" as const),
  text: index % 3 === 0 ? `Question ${index + 1}` : `Evidence-based response ${index + 1}.`,
}));
const suggestions = [
  { id: "summarize", label: "Summarize the current evidence", textValue: "Summarize" },
  { id: "compare", label: "Compare two implementation paths", textValue: "Compare" },
  {
    description: "Keeps the request local and domain-neutral.",
    id: "risks",
    label: "List unresolved risks",
    textValue: "Risks",
  },
];
const people = [
  {
    id: "asha",
    lastActive: "2026-01-15T09:59:00Z",
    name: "Asha Rao",
    status: "available" as const,
  },
  { id: "mina", lastActive: "2026-01-15T08:00:00Z", name: "Mina Park", status: "away" as const },
  { id: "jon", name: "Jon Bell", status: "offline" as const },
];
const auditEvents = Array.from({ length: 30 }, (_, index) => ({
  action: index % 2 === 0 ? "reviewed" : "updated",
  actor: index % 2 === 0 ? "Asha Rao" : "Mina Park",
  details: index === 4 ? "=FORMULA-like content remains safe in CSV" : "Recorded local evidence.",
  id: `event-${index}`,
  object: `Component ${index + 1}`,
  timestamp: `2026-01-${String((index % 20) + 1).padStart(2, "0")}T10:00:00Z`,
}));
const fakeAdapter = createDeterministicAiChatWorkspaceAdapter();
const emptyAdapter: AiChatWorkspaceAdapter = {
  ...fakeAdapter,
  async load(signal) {
    if (signal.aborted) throw new DOMException("The operation was aborted.", "AbortError");
    return { conversations: [], messagesByConversation: {} };
  },
};
const errorAdapter: AiChatWorkspaceAdapter = {
  ...fakeAdapter,
  async load() {
    throw new Error("Deterministic workspace load failure.");
  },
};

const disabled = {
  allowSensitiveReveal: false,
  announceCompletion: false,
  announceMessages: false,
  announceUpdates: false,
  exportCsv: false,
  filtering: false,
  followOutput: false,
  optimisticReplies: false,
  selectionMode: false,
  showAttachments: false,
  showCharacterBudget: false,
  showCursor: false,
  showDescriptions: false,
  showDetails: false,
  showDuration: false,
  showMentions: false,
  showProgress: false,
  showRoleContext: false,
  showSourceDetail: false,
  showSummary: false,
  stalePolicy: false,
  submitShortcut: false,
  virtualize: false,
} as const;

function AiCollaborationStory(args: StoryProps): ReactElement {
  const [draft, setDraft] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [selectedPrompt, setSelectedPrompt] = useState<string | null>(null);
  const [resolved, setResolved] = useState(false);
  switch (args.kind) {
    case "message":
      return (
        <Message
          actions={<button type="button">Copy response</button>}
          author="Assistant"
          deliveryState="streaming"
          role="assistant"
          showRoleContext={args.showRoleContext}
          timestamp="2026-01-15T10:00:00Z"
        >
          The implementation keeps its provider and network boundaries explicit.
        </Message>
      );
    case "streaming-text":
      return (
        <StreamingText
          announceUpdates={args.announceUpdates}
          segments={[
            { id: "stable-1", text: "Stable prior content remains selectable. " },
            { id: "stable-2", text: "New content appends with a persistent id." },
          ]}
          showCursor={args.showCursor}
          status="streaming"
        />
      );
    case "message-list":
      return (
        <MessageList
          announceNewMessages={args.announceMessages}
          followOutput={args.followOutput ? "instant" : false}
          getItemId={(message) => message.id}
          items={messages}
          label="Evidence conversation"
          renderItem={(message) => <Message role={message.role}>{message.text}</Message>}
          showFollowControl={args.followOutput}
          virtualization={
            args.virtualize ? { estimateSize: 112, overscan: 2, viewportHeight: 336 } : false
          }
        />
      );
    case "chat-composer":
      return (
        <div>
          <ChatComposer
            attachments={
              args.showAttachments
                ? [{ id: "notes", name: "review-notes.txt", status: "ready" }]
                : false
            }
            label="Message"
            maxLength={400}
            onAttachmentRemove={() => undefined}
            onSubmitMessage={({ value }) => setSubmitted(value)}
            onValueChange={setDraft}
            showCharacterBudget={args.showCharacterBudget}
            submitShortcut={args.submitShortcut ? "mod-enter" : false}
            value={draft}
          />
          {submitted === "" ? null : <output>Submitted message: {submitted}</output>}
        </div>
      );
    case "prompt-suggestions":
      return (
        <PromptSuggestions
          label="Suggested prompts"
          onSelectionChange={setSelectedPrompt}
          selectedKey={selectedPrompt}
          selectionMode={args.selectionMode}
          showDescriptions={args.showDescriptions}
          suggestions={suggestions}
        />
      );
    case "citation":
      return (
        <p>
          Inspect the local evidence
          <Citation
            excerpt="A source detail can be read without opening a separate overlay."
            href="/quality/button"
            number={1}
            showSourceDetail={args.showSourceDetail}
            sourceName="Quality record"
            title="Button quality evidence"
          />
        </p>
      );
    case "reasoning":
      return (
        <Reasoning
          announceCompletion={args.announceCompletion}
          defaultOpen
          progress={args.showProgress ? { completed: 2, label: "Checks", total: 4 } : false}
          status="streaming"
          summary="Process summary"
        >
          Two of four local checks have completed. No private chain-of-thought is exposed.
        </Reasoning>
      );
    case "tool-call":
      return (
        <ToolCall
          allowSensitiveReveal={args.allowSensitiveReveal}
          duration="420 milliseconds"
          name="Read local quality record"
          showDetails={
            args.showDetails
              ? {
                  input: '{"path":"quality/button"}',
                  output: "token=private-fixture · 4 assertions passed",
                  redactions: ["private-fixture"],
                  sensitive: true,
                }
              : false
          }
          showDuration={args.showDuration}
          status="success"
        />
      );
    case "comment-thread":
      return (
        <CommentThread
          comments={[
            {
              author: "Asha Rao",
              body: "The keyboard path now retains the user's reading position.",
              id: "comment-1",
              timestamp: "2026-01-15T10:00:00Z",
            },
          ]}
          draft={draft}
          label="Implementation review"
          mentionSuggestions={
            args.showMentions
              ? [
                  { id: "mina", label: "Mina Park", value: "mina" },
                  { id: "jon", label: "Jon Bell", value: "jon" },
                ]
              : false
          }
          onDraftChange={setDraft}
          onReply={async () => undefined}
          onResolvedChange={setResolved}
          optimisticReplies={args.optimisticReplies}
          resolved={resolved}
        />
      );
    case "collaboration-presence":
      return (
        <CollaborationPresence
          label="Current collaborators"
          people={people}
          showSummary={args.showSummary}
          stalePolicy={
            args.stalePolicy
              ? { afterMilliseconds: 15 * 60 * 1000, now: "2026-01-15T10:00:00Z" }
              : false
          }
        />
      );
    case "audit-log":
      return (
        <AuditLog
          events={auditEvents}
          exportCsv={args.exportCsv ? { onExport: () => undefined } : false}
          filtering={args.filtering ? {} : false}
          label="Workspace audit log"
          virtualization={
            args.virtualize ? { estimateSize: 116, overscan: 2, viewportHeight: 348 } : false
          }
        />
      );
    case "ai-chat-workspace":
      return (
        <AiChatWorkspace
          adapter={fakeAdapter}
          announceMessages={args.announceMessages}
          attachments={args.showAttachments ? ["review-notes.txt"] : false}
          followOutput={args.followOutput}
          showCharacterBudget={args.showCharacterBudget}
          showCitationDetails={args.showSourceDetail}
          showRoleContext={args.showRoleContext}
          showStreamingCursor={args.showCursor}
          showToolDetails={args.showDetails}
          submitShortcut={args.submitShortcut ? "mod-enter" : false}
          suggestions={
            args.showDescriptions
              ? [
                  { id: "summary", label: "Summarize the current evidence" },
                  { id: "risk", label: "List unresolved risks" },
                ]
              : false
          }
        />
      );
  }
}

const meta: Meta<typeof AiCollaborationStory> = {
  title: "Components/AI and Collaboration",
  component: AiCollaborationStory,
  decorators: [
    (Story, context) =>
      context.args.kind === "ai-chat-workspace" || context.id.endsWith("narrow-rtl-preferences") ? (
        <Story />
      ) : (
        <div aria-label="AI and collaboration component example" role="region">
          <Story />
        </div>
      ),
  ],
  parameters: { layout: "padded", a11y: { test: "error" } },
  argTypes: {
    kind: {
      control: "select",
      options: [
        "message",
        "message-list",
        "chat-composer",
        "prompt-suggestions",
        "citation",
        "reasoning",
        "tool-call",
        "streaming-text",
        "comment-thread",
        "collaboration-presence",
        "audit-log",
        "ai-chat-workspace",
      ],
    },
    allowSensitiveReveal: { control: "boolean" },
    announceCompletion: { control: "boolean" },
    announceMessages: { control: "boolean" },
    announceUpdates: { control: "boolean" },
    exportCsv: { control: "boolean" },
    filtering: { control: "boolean" },
    followOutput: { control: "boolean" },
    optimisticReplies: { control: "boolean" },
    selectionMode: { control: "boolean" },
    showAttachments: { control: "boolean" },
    showCharacterBudget: { control: "boolean" },
    showCursor: { control: "boolean" },
    showDescriptions: { control: "boolean" },
    showDetails: { control: "boolean" },
    showDuration: { control: "boolean" },
    showMentions: { control: "boolean" },
    showProgress: { control: "boolean" },
    showRoleContext: { control: "boolean" },
    showSourceDetail: { control: "boolean" },
    showSummary: { control: "boolean" },
    stalePolicy: { control: "boolean" },
    submitShortcut: { control: "boolean" },
    virtualize: { control: "boolean" },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const BasicMessage: Story = { args: { ...disabled, kind: "message" } };
export const RecommendedMessage: Story = {
  args: { ...disabled, kind: "message", showRoleContext: true },
};
export const BasicMessageList: Story = { args: { ...disabled, kind: "message-list" } };
export const RecommendedMessageList: Story = {
  args: {
    ...disabled,
    announceMessages: true,
    followOutput: true,
    kind: "message-list",
    virtualize: true,
  },
};
export const BasicChatComposer: Story = { args: { ...disabled, kind: "chat-composer" } };
export const RecommendedChatComposer: Story = {
  args: {
    ...disabled,
    kind: "chat-composer",
    showAttachments: true,
    showCharacterBudget: true,
    submitShortcut: true,
  },
};
export const BasicPromptSuggestions: Story = {
  args: { ...disabled, kind: "prompt-suggestions" },
};
export const RecommendedPromptSuggestions: Story = {
  args: {
    ...disabled,
    kind: "prompt-suggestions",
    selectionMode: true,
    showDescriptions: true,
  },
};
export const BasicCitation: Story = { args: { ...disabled, kind: "citation" } };
export const RecommendedCitation: Story = {
  args: { ...disabled, kind: "citation", showSourceDetail: true },
};
export const BasicReasoning: Story = { args: { ...disabled, kind: "reasoning" } };
export const RecommendedReasoning: Story = {
  args: {
    ...disabled,
    announceCompletion: true,
    kind: "reasoning",
    showProgress: true,
  },
};
export const BasicToolCall: Story = { args: { ...disabled, kind: "tool-call" } };
export const RecommendedToolCall: Story = {
  args: {
    ...disabled,
    allowSensitiveReveal: true,
    kind: "tool-call",
    showDetails: true,
    showDuration: true,
  },
};
export const BasicStreamingText: Story = { args: { ...disabled, kind: "streaming-text" } };
export const RecommendedStreamingText: Story = {
  args: {
    ...disabled,
    announceUpdates: true,
    kind: "streaming-text",
    showCursor: true,
  },
};
export const BasicCommentThread: Story = { args: { ...disabled, kind: "comment-thread" } };
export const RecommendedCommentThread: Story = {
  args: {
    ...disabled,
    kind: "comment-thread",
    optimisticReplies: true,
    showMentions: true,
  },
};
export const BasicCollaborationPresence: Story = {
  args: { ...disabled, kind: "collaboration-presence" },
};
export const RecommendedCollaborationPresence: Story = {
  args: {
    ...disabled,
    kind: "collaboration-presence",
    showSummary: true,
    stalePolicy: true,
  },
};
export const BasicAuditLog: Story = { args: { ...disabled, kind: "audit-log" } };
export const RecommendedAuditLog: Story = {
  args: {
    ...disabled,
    exportCsv: true,
    filtering: true,
    kind: "audit-log",
    virtualize: true,
  },
};
export const BasicAiChatWorkspace: Story = {
  args: { ...disabled, kind: "ai-chat-workspace" },
};
export const RecommendedAiChatWorkspace: Story = {
  args: {
    ...disabled,
    announceMessages: true,
    followOutput: true,
    kind: "ai-chat-workspace",
    showAttachments: true,
    showCharacterBudget: true,
    showCursor: true,
    showDescriptions: true,
    showDetails: true,
    showRoleContext: true,
    showSourceDetail: true,
    submitShortcut: true,
  },
};

export const StateMatrix: Story = {
  args: { ...disabled, kind: "tool-call" },
  render: () => (
    <div style={{ display: "grid", gap: "1rem" }}>
      <section aria-labelledby="tool-states">
        <h2 id="tool-states">Tool states</h2>
        <ToolCall name="Waiting for approval" status="pending" />
        <ToolCall name="Read local fixture" onCancel={() => undefined} status="running" />
        <ToolCall
          error="The fixture could not be read."
          name="Read fixture"
          onRetry={() => undefined}
          status="error"
        />
        <ToolCall name="Cancelled local read" status="cancelled" />
      </section>
      <section aria-labelledby="composer-states">
        <h2 id="composer-states">Composer states</h2>
        <ChatComposer disabled label="Disabled message" />
        <ChatComposer defaultValue="Readable draft" label="Read-only message" readOnly />
        <ChatComposer
          errorContent="Reconnect to send this draft."
          label="Offline draft"
          status="offline"
        />
        <ChatComposer
          errorContent="The draft could not be sent."
          label="Failed draft"
          status="error"
        />
      </section>
      <section aria-labelledby="content-states">
        <h2 id="content-states">Content states</h2>
        <Message deliveryState="error" role="assistant">
          The response stopped before it completed.
        </Message>
        <StreamingText
          segments={[{ id: "interrupted", text: "Partial response." }]}
          status="error"
        />
        <Reasoning status="error" summary="Process summary unavailable">
          The process summary could not be completed.
        </Reasoning>
        <Citation href="javascript:alert(1)" number={2} title="Unsafe citation" />
      </section>
      <section aria-labelledby="empty-states">
        <h2 id="empty-states">Empty and unavailable states</h2>
        <MessageList
          getItemId={(item: { readonly id: string }) => item.id}
          items={[]}
          label="Empty conversation"
          renderItem={() => null}
        />
        <PromptSuggestions
          label="Unavailable suggestions"
          suggestions={[
            { disabled: true, id: "unavailable", label: "Unavailable prompt", textValue: "" },
          ]}
        />
        <CollaborationPresence label="No collaborators" people={[]} />
        <CollaborationPresence
          label="Offline collaborator"
          people={[{ id: "offline", name: "Sam Lee", status: "offline" }]}
        />
        <AuditLog events={[]} label="Empty audit log" />
        <CommentThread comments={[]} defaultResolved label="Resolved empty thread" />
      </section>
    </div>
  ),
};

function ControlledReasoningStory(): ReactElement {
  const [open, setOpen] = useState(false);
  return (
    <Reasoning onOpenChange={setOpen} open={open} status="complete" summary="Controlled summary">
      Consumer-owned disclosure state remains synchronized.
    </Reasoning>
  );
}

export const ControlledState: Story = {
  args: { ...disabled, kind: "reasoning" },
  render: () => <ControlledReasoningStory />,
};

export const OptimisticErrorRecovery: Story = {
  args: { ...disabled, kind: "comment-thread" },
  render: () => (
    <CommentThread
      comments={[]}
      defaultDraft="Check this path"
      label="Failed reply recovery"
      onReply={async () => {
        throw new Error("Deterministic fixture failure");
      }}
      optimisticReplies
    />
  ),
};

export const EmptyAiChatWorkspace: Story = {
  args: { ...disabled, kind: "ai-chat-workspace" },
  render: () => <AiChatWorkspace adapter={emptyAdapter} />,
};

export const OfflineAiChatWorkspace: Story = {
  args: { ...disabled, kind: "ai-chat-workspace" },
  render: () => <AiChatWorkspace adapter={fakeAdapter} offline />,
};

export const ErrorAiChatWorkspace: Story = {
  args: { ...disabled, kind: "ai-chat-workspace" },
  render: () => <AiChatWorkspace adapter={errorAdapter} />,
};

export const FormLifecycle: Story = {
  args: { ...disabled, kind: "chat-composer" },
  render: () => (
    <div>
      <ChatComposer
        defaultValue="Draft retained by native reset"
        id="composer-lifecycle"
        label="Message"
        name="message"
      />
      <button form="composer-lifecycle" type="reset">
        Reset draft
      </button>
    </div>
  ),
};

export const NarrowRtlPreferences: Story = {
  args: { ...disabled, kind: "message" },
  render: () => (
    <div dir="rtl" style={{ display: "grid", gap: "1rem", inlineSize: 320, maxInlineSize: "100%" }}>
      <section
        aria-label="AI and collaboration component preference examples"
        style={{ display: "grid", gap: "1rem" }}
      >
        <Message author="المساعد" deliveryState="complete" role="assistant" showRoleContext>
          نص طويل يوضح أن المحتوى يلتف في مساحة ضيقة دون تمرير أفقي أو اعتماد على اللون وحده.
        </Message>
        <StreamingText
          segments={[{ id: "rtl-stream", text: "محتوى متدفق قابل للتحديد." }]}
          showCursor
          status="streaming"
        />
        <MessageList
          getItemId={(item: { readonly id: string }) => item.id}
          items={[{ id: "narrow-message", text: "رسالة في قائمة ضيقة." }]}
          label="قائمة الرسائل"
          renderItem={(item) => <Message role="user">{item.text}</Message>}
        />
        <ChatComposer defaultValue="مسودة قابلة للتحرير" label="رسالة" />
        <PromptSuggestions
          label="اقتراحات"
          suggestions={[{ id: "rtl-prompt", label: "راجع الأدلة", textValue: "راجع الأدلة" }]}
        />
        <p>
          مرجع محلي
          <Citation href="/quality/button" number={1} title="دليل الجودة" />
        </p>
        <Reasoning summary="ملخص العملية">تفاصيل موجزة قابلة للكشف.</Reasoning>
        <ToolCall name="قراءة السجل المحلي" status="success" />
        <CommentThread comments={[]} label="سلسلة التعليقات" />
        <CollaborationPresence
          label="المتعاونون"
          people={[{ id: "rtl-person", name: "سارة علي", status: "available" }]}
        />
        <AuditLog
          events={[
            {
              action: "راجع",
              actor: "سارة علي",
              id: "rtl-event",
              object: "المكوّن",
              timestamp: "2026-01-15T10:00:00Z",
            },
          ]}
          label="سجل التدقيق"
        />
      </section>
      <AiChatWorkspace adapter={fakeAdapter} />
    </div>
  ),
};
