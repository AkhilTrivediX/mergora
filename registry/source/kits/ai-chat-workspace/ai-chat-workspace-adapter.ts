export type AiChatWorkspaceRole = "assistant" | "system" | "tool" | "user";

export interface AiChatWorkspaceCitation {
  /** Optional short excerpt rendered when citation details are enabled. */
  readonly excerpt?: string;
  /** Consumer-validated citation destination passed to the citation link. */
  readonly href: string;
  /** One-based citation number used to connect inline source context. */
  readonly number: number;
  /** Optional human-readable publisher or source name. */
  readonly sourceName?: string;
  /** Required human-readable citation title. */
  readonly title: string;
}

export interface AiChatWorkspaceToolCall {
  /** Stable tool-call identifier used for rendering identity. */
  readonly id: string;
  /** Optional serialized input shown only when tool details are enabled. */
  readonly input?: string;
  /** Human-readable tool name rendered in the call header. */
  readonly name: string;
  /** Optional serialized output shown only when tool details are enabled. */
  readonly output?: string;
  /** Marks input and output as sensitive for default-hidden detail handling. */
  readonly sensitive?: boolean;
  /** Tool execution lifecycle rendered as status and busy context. */
  readonly status: "cancelled" | "error" | "pending" | "running" | "success";
}

export interface AiChatWorkspaceMessage {
  /** Optional immutable sources rendered only when citation details are enabled. */
  readonly citations?: readonly AiChatWorkspaceCitation[];
  /** ISO-compatible creation instant used for localized message timing. */
  readonly createdAt: string;
  /** Stable message identifier used for streaming replacement, retry, edit, and branch actions. */
  readonly id: string;
  /** Conversation role that controls message context and available actions. */
  readonly role: AiChatWorkspaceRole;
  /** Ordered immutable streamed text segments preserving stable identity. */
  readonly segments: readonly {
    /** Stable segment identifier used for incremental rendering identity. */
    readonly id: string;
    /** Segment text concatenated in array order to form the complete message. */
    readonly text: string;
  }[];
  /** Optional delivery lifecycle used for streaming, error, and completion context. */
  readonly status?: "complete" | "error" | "pending" | "streaming";
  /** Optional immutable tool calls rendered only through enabled tool surfaces. */
  readonly toolCalls?: readonly AiChatWorkspaceToolCall[];
}

export interface AiChatWorkspaceConversation {
  /** Stable conversation identifier used for selection, messages, and adapter operations. */
  readonly id: string;
  /** Human-readable conversation title shown in navigation. */
  readonly title: string;
  /** ISO-compatible freshness instant for consumer ordering or context. */
  readonly updatedAt: string;
}

export interface AiChatWorkspaceSnapshot {
  /** Immutable conversations available in the workspace navigation. */
  readonly conversations: readonly AiChatWorkspaceConversation[];
  /** Immutable message collections keyed by their owning conversation ID. */
  readonly messagesByConversation: Readonly<Record<string, readonly AiChatWorkspaceMessage[]>>;
}

export interface AiChatWorkspaceSendInput {
  /** Consumer-owned attachment identifiers or references included with the request. */
  readonly attachments: readonly string[];
  /** Conversation identifier that owns the outgoing request. */
  readonly conversationId: string;
  /** Non-empty user-authored message text. */
  readonly text: string;
}

export interface AiChatWorkspaceAdapter {
  /** Optionally creates a branch and returns its conversation ID; omission removes branch actions. */
  readonly branchMessage?: (conversationId: string, messageId: string) => Promise<string>;
  /** Optionally cancels consumer execution after the local stream signal is aborted. */
  readonly cancel?: (conversationId: string) => Promise<void> | void;
  /** Optionally edits a user message; omission cleanly removes edit actions. */
  readonly editMessage?: (
    conversationId: string,
    messageId: string,
    nextText: string,
  ) => Promise<void>;
  /** Loads the immutable conversation snapshot with lifecycle cancellation. */
  readonly load: (signal: AbortSignal) => Promise<AiChatWorkspaceSnapshot>;
  /** Optionally retries one message; omission cleanly removes retry actions. */
  readonly retryMessage?: (
    conversationId: string,
    messageId: string,
    signal: AbortSignal,
  ) => Promise<AiChatWorkspaceMessage>;
  /** Sends input and returns one final message or an asynchronous stream of message snapshots. */
  readonly send: (
    input: AiChatWorkspaceSendInput,
    signal: AbortSignal,
  ) => Promise<AiChatWorkspaceMessage> | AsyncIterable<AiChatWorkspaceMessage>;
}

const FIXTURE_EPOCH_TIME = "1970-01-01T00:00:00.000Z";

export function createDeterministicAiChatWorkspaceAdapter(): AiChatWorkspaceAdapter {
  const snapshot: AiChatWorkspaceSnapshot = {
    conversations: [
      { id: "component-review", title: "Component review", updatedAt: FIXTURE_EPOCH_TIME },
      { id: "empty-thread", title: "Empty conversation", updatedAt: FIXTURE_EPOCH_TIME },
    ],
    messagesByConversation: {
      "component-review": [
        {
          createdAt: FIXTURE_EPOCH_TIME,
          id: "welcome",
          role: "assistant",
          segments: [
            {
              id: "welcome-1",
              text: "I can summarize the evidence already provided in this local example.",
            },
          ],
          status: "complete",
        },
      ],
      "empty-thread": [],
    },
  };

  return {
    async branchMessage(conversationId, messageId) {
      return `${conversationId}-branch-${messageId}`;
    },
    async editMessage() {
      return undefined;
    },
    async load(signal) {
      if (signal.aborted) throw new DOMException("The operation was aborted.", "AbortError");
      return snapshot;
    },
    async retryMessage(conversationId, messageId, signal) {
      if (signal.aborted) throw new DOMException("The operation was aborted.", "AbortError");
      return {
        createdAt: FIXTURE_EPOCH_TIME,
        id: `${messageId}-retry`,
        role: "assistant",
        segments: [{ id: `${messageId}-retry-1`, text: `Retry completed for ${conversationId}.` }],
        status: "complete",
      };
    },
    send(input, signal) {
      async function* stream(): AsyncIterable<AiChatWorkspaceMessage> {
        if (signal.aborted) throw new DOMException("The operation was aborted.", "AbortError");
        const id = `assistant-${input.conversationId}-${input.text.length}`;
        yield {
          createdAt: FIXTURE_EPOCH_TIME,
          id,
          role: "assistant",
          segments: [{ id: `${id}-1`, text: "Reviewing the local, deterministic fixture." }],
          status: "streaming",
        };
        if (signal.aborted) throw new DOMException("The operation was aborted.", "AbortError");
        yield {
          citations: [
            {
              href: "/docs/quality",
              number: 1,
              title: "Local quality evidence",
            },
          ],
          createdAt: FIXTURE_EPOCH_TIME,
          id,
          role: "assistant",
          segments: [
            { id: `${id}-1`, text: "Reviewing the local, deterministic fixture." },
            { id: `${id}-2`, text: " No external model or network request was used." },
          ],
          status: "complete",
          toolCalls: [
            {
              id: `${id}-tool`,
              name: "Read local fixture",
              output: "2 records inspected",
              status: "success",
            },
          ],
        };
      }
      return stream();
    },
  };
}
