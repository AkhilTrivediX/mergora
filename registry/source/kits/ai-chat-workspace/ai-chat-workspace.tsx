"use client";

import "./ai-chat-workspace.css";

import { useState, type HTMLAttributes } from "react";

import { ChatComposer } from "../../components/chat-composer/index.js";
import { Citation } from "../../components/citation/index.js";
import { Message } from "../../components/message/index.js";
import { MessageList } from "../../components/message-list/index.js";
import { PromptSuggestions } from "../../components/prompt-suggestions/index.js";
import { StreamingText } from "../../components/streaming-text/index.js";
import { ToolCall } from "../../components/tool-call/index.js";
import type {
  AiChatWorkspaceAdapter,
  AiChatWorkspaceMessage,
} from "./ai-chat-workspace-adapter.js";
import { useAiChatWorkspace } from "./ai-chat-workspace-state.js";

export interface AiChatWorkspaceProps extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
  /** Consumer adapter that owns model, network, storage, authorization, privacy, and safety. */
  readonly adapter: AiChatWorkspaceAdapter;
  /** Enables new-message announcements; false removes the list's live announcement behavior. */
  readonly announceMessages?: boolean;
  /** Adds consumer-owned attachment references; false removes attachment UI and send payload entries. */
  readonly attachments?: false | readonly string[];
  /** Preferred initial conversation identifier after the workspace snapshot loads. */
  readonly defaultConversationId?: string;
  /** Follows newly streamed output; false leaves scrolling fully user-controlled. */
  readonly followOutput?: boolean;
  /** Prevents load and send requests while preserving readable local content. */
  readonly offline?: boolean;
  /** Receives a newly created conversation ID from an enabled branch action. */
  readonly onBranchCreated?: (conversationId: string) => void;
  /** Adds composer character-budget context; false removes the counter semantics. */
  readonly showCharacterBudget?: boolean;
  /** Adds source details to messages; false removes citation rendering and link semantics. */
  readonly showCitationDetails?: boolean;
  /** Adds visible author-role context; false removes the extra role output. */
  readonly showRoleContext?: boolean;
  /** Shows a decorative cursor for streaming messages; false removes it. */
  readonly showStreamingCursor?: boolean;
  /** Adds tool input/output disclosures; false removes detail and sensitive-value UI. */
  readonly showToolDetails?: boolean;
  /** Enables a chosen composer submit shortcut; false removes shortcut submission behavior. */
  readonly submitShortcut?: false | "enter" | "mod-enter";
  /** Adds selectable prompt suggestions; false removes their UI and draft-update events. */
  readonly suggestions?:
    | false
    | readonly {
        /** Stable suggestion identifier used for rendering and activation. */
        readonly id: string;
        /** Human-readable suggestion text copied into the composer draft. */
        readonly label: string;
      }[];
}

function messageText(message: AiChatWorkspaceMessage): string {
  return message.segments.map((segment) => segment.text).join("");
}

export function AiChatWorkspace({
  adapter,
  announceMessages = false,
  attachments = false,
  className,
  defaultConversationId,
  followOutput = false,
  offline = false,
  onBranchCreated,
  showCharacterBudget = false,
  showCitationDetails = false,
  showRoleContext = false,
  showStreamingCursor = false,
  showToolDetails = false,
  submitShortcut = false,
  suggestions = false,
  ...props
}: AiChatWorkspaceProps) {
  const workspace = useAiChatWorkspace({
    adapter,
    ...(defaultConversationId === undefined ? {} : { defaultConversationId }),
    offline,
  });
  const [draft, setDraft] = useState("");
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const attachmentNames = attachments === false ? [] : attachments;
  const promptSuggestions = suggestions === false ? [] : suggestions;
  const busy = workspace.messages.some((message) => message.status === "streaming");

  const submit = async (text: string) => {
    if (editingMessageId !== null) {
      await workspace.edit(editingMessageId, text);
      setEditingMessageId(null);
    }
    setDraft("");
    await workspace.send(text, attachmentNames);
  };

  return (
    <div
      {...props}
      className={
        className === undefined ? "mrg-ai-chat-workspace" : `mrg-ai-chat-workspace ${className}`
      }
      data-slot="ai-chat-workspace"
    >
      <aside aria-label="Conversations" data-slot="ai-chat-workspace-sidebar">
        <h2>Conversations</h2>
        {workspace.snapshot?.conversations.length ? (
          <ul>
            {workspace.snapshot.conversations.map((conversation) => (
              <li key={conversation.id}>
                <button
                  aria-current={workspace.conversationId === conversation.id ? "page" : undefined}
                  onClick={() => workspace.selectConversation(conversation.id)}
                  type="button"
                >
                  {conversation.title}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p>No conversations yet.</p>
        )}
      </aside>
      <main data-slot="ai-chat-workspace-main">
        <header>
          <h1>AI chat workspace</h1>
          <p>
            The consumer owns the model, network, storage, authorization, privacy, safety, legal,
            and full-product accessibility decisions.
          </p>
        </header>
        {workspace.state === "loading" ? <p role="status">Loading conversations…</p> : null}
        {workspace.state === "offline" ? (
          <div data-slot="ai-chat-workspace-offline" role="status">
            Offline. Existing local content remains readable; sending is paused.
          </div>
        ) : null}
        {workspace.state === "error" ? (
          <div data-slot="ai-chat-workspace-error" role="alert">
            <span>{workspace.error || "The workspace could not continue."}</span>
            <button onClick={() => void workspace.reload()} type="button">
              Retry workspace
            </button>
          </div>
        ) : null}
        <MessageList
          announceNewMessages={announceMessages}
          emptyContent="Start with a suggestion or write a message."
          followOutput={followOutput ? "instant" : false}
          getItemId={(message) => message.id}
          items={workspace.messages}
          label="Conversation messages"
          renderItem={(message) => (
            <Message
              actions={
                message.role === "user" && adapter.editMessage !== undefined ? (
                  <button
                    onClick={() => {
                      setEditingMessageId(message.id);
                      setDraft(messageText(message));
                    }}
                    type="button"
                  >
                    Edit message
                  </button>
                ) : (
                  <>
                    {adapter.retryMessage === undefined ? null : (
                      <button onClick={() => void workspace.retry(message.id)} type="button">
                        Retry response
                      </button>
                    )}
                    {adapter.branchMessage === undefined ? null : (
                      <button
                        onClick={() =>
                          void workspace.branch(message.id).then((id) => {
                            if (id !== null) onBranchCreated?.(id);
                          })
                        }
                        type="button"
                      >
                        Branch conversation
                      </button>
                    )}
                  </>
                )
              }
              author={message.role === "user" ? "You" : "Assistant"}
              deliveryState={message.status ?? "complete"}
              role={message.role}
              showRoleContext={showRoleContext}
              timestamp={message.createdAt}
            >
              <StreamingText
                announceUpdates={announceMessages}
                segments={message.segments}
                showCursor={showStreamingCursor}
                status={message.status === "pending" ? "idle" : (message.status ?? "complete")}
              />
              {message.citations?.map((citation) => (
                <Citation
                  key={citation.number}
                  showSourceDetail={showCitationDetails}
                  {...citation}
                />
              ))}
              {message.toolCalls?.map((tool) => (
                <ToolCall
                  key={tool.id}
                  name={tool.name}
                  showDetails={
                    showToolDetails
                      ? {
                          ...(tool.input === undefined ? {} : { input: tool.input }),
                          ...(tool.output === undefined ? {} : { output: tool.output }),
                          ...(tool.sensitive === undefined ? {} : { sensitive: tool.sensitive }),
                        }
                      : false
                  }
                  status={tool.status}
                />
              ))}
            </Message>
          )}
          showFollowControl={followOutput}
        />
        {promptSuggestions.length === 0 ? null : (
          <PromptSuggestions
            label="Suggested prompts"
            onAction={(suggestion) => setDraft(suggestion.textValue)}
            suggestions={promptSuggestions.map((suggestion) => ({
              ...suggestion,
              textValue: suggestion.label,
            }))}
          />
        )}
        <ChatComposer
          attachments={attachmentNames.map((name, index) => ({ id: `${index}-${name}`, name }))}
          errorContent={offline ? "Reconnect to send this draft." : undefined}
          label={editingMessageId === null ? "Message" : "Edit message"}
          onStop={() => void workspace.cancel()}
          onSubmitMessage={({ value }) => void submit(value)}
          onValueChange={setDraft}
          showCharacterBudget={showCharacterBudget}
          status={offline ? "offline" : busy ? "streaming" : "idle"}
          submitShortcut={submitShortcut}
          value={draft}
        />
      </main>
    </div>
  );
}

export const AiChatWorkspacePage = AiChatWorkspace;
