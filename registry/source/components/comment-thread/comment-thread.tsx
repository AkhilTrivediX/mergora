"use client";

import "./comment-thread.css";

import {
  forwardRef,
  useRef,
  useState,
  type FormEvent,
  type HTMLAttributes,
  type ReactNode,
} from "react";

export interface CommentThreadComment {
  /** Optional consumer-owned comment actions rendered after the body. */
  readonly actions?: ReactNode;
  /** Visible author identity for the comment. */
  readonly author: ReactNode;
  /** Primary consumer-rendered comment content. */
  readonly body: ReactNode;
  /** Stable unique comment identifier used for rendering identity. */
  readonly id: string;
  /** Valid comment instant rendered locally with canonical machine-readable time. */
  readonly timestamp: Date | string;
}

export interface CommentMentionSuggestion {
  /** Stable unique suggestion identifier used for rendering identity. */
  readonly id: string;
  /** Human-readable mention label used for matching and presentation. */
  readonly label: string;
  /** Canonical mention value inserted into the draft. */
  readonly value: string;
}

interface OptimisticReply {
  /** Stable local optimistic reply identifier. */
  readonly id: string;
  /** Local posting lifecycle controlling busy and recovery actions. */
  readonly state: "error" | "pending";
  /** Trimmed reply text retained for retry after consumer persistence failure. */
  readonly text: string;
}

export interface CommentThreadProps extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
  /** Immutable canonical comments supplied by consumer storage. */
  readonly comments: readonly CommentThreadComment[];
  /** Initial reply text for uncontrolled drafting. */
  readonly defaultDraft?: string;
  /** Initial thread resolution state for uncontrolled use. */
  readonly defaultResolved?: boolean;
  /** Controlled reply draft; use with `onDraftChange`. */
  readonly draft?: string;
  /** Consumer empty-state content shown before canonical or optimistic comments exist. */
  readonly emptyContent?: ReactNode;
  /** Required accessible and visible thread name. */
  readonly label: string;
  /** Adds local mention matching and insertion; false removes suggestion UI and events. */
  readonly mentionSuggestions?: false | readonly CommentMentionSuggestion[];
  /** Reports controlled or uncontrolled draft changes and optimistic clearing. */
  readonly onDraftChange?: (draft: string) => void;
  /** Persists a reply through consumer-owned network/storage; omission disables reply input. */
  readonly onReply?: (body: string) => Promise<void> | void;
  /** Adds resolve/reopen actions and reports controlled or uncontrolled state changes. */
  readonly onResolvedChange?: (resolved: boolean) => void;
  /** Adds reversible pending/error reply previews; false keeps the draft until persistence succeeds. */
  readonly optimisticReplies?: boolean;
  /** Controlled thread resolution state; resolved threads remove reply form semantics. */
  readonly resolved?: boolean;
}

function validTimestamp(value: Date | string): Date {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.valueOf())) {
    throw new RangeError("Mergora CommentThread timestamps must be valid dates.");
  }
  return date;
}

export const CommentThread = forwardRef<HTMLDivElement, CommentThreadProps>(function CommentThread(
  {
    className,
    comments,
    defaultDraft = "",
    defaultResolved = false,
    draft,
    emptyContent = "No comments yet.",
    label,
    mentionSuggestions = false,
    onDraftChange,
    onReply,
    onResolvedChange,
    optimisticReplies = false,
    resolved,
    ...props
  },
  ref,
) {
  const draftControlled = draft !== undefined;
  const resolvedControlled = resolved !== undefined;
  const [uncontrolledDraft, setUncontrolledDraft] = useState(defaultDraft);
  const [uncontrolledResolved, setUncontrolledResolved] = useState(defaultResolved);
  const [optimistic, setOptimistic] = useState<readonly OptimisticReply[]>([]);
  const [error, setError] = useState("");
  const sequence = useRef(0);
  const currentDraft = draftControlled ? draft : uncontrolledDraft;
  const currentResolved = resolvedControlled ? resolved : uncontrolledResolved;
  const mentions = mentionSuggestions === false ? [] : mentionSuggestions;
  const mentionQuery = /(?:^|\s)@([^\s@]*)$/u.exec(currentDraft)?.[1]?.toLocaleLowerCase() ?? null;
  const visibleMentions =
    mentionQuery === null
      ? []
      : mentions.filter((entry) => entry.label.toLocaleLowerCase().startsWith(mentionQuery));

  const publishDraft = (next: string) => {
    if (!draftControlled) setUncontrolledDraft(next);
    onDraftChange?.(next);
  };
  const publishResolved = (next: boolean) => {
    if (!resolvedControlled) setUncontrolledResolved(next);
    onResolvedChange?.(next);
  };
  const send = async (text: string, optimisticId?: string) => {
    try {
      await onReply?.(text);
      if (optimisticId !== undefined) {
        setOptimistic((entries) => entries.filter((entry) => entry.id !== optimisticId));
      }
      setError("");
    } catch {
      if (optimisticId !== undefined) {
        setOptimistic((entries) =>
          entries.map((entry) =>
            entry.id === optimisticId ? { ...entry, state: "error" as const } : entry,
          ),
        );
      } else {
        setError("The comment could not be posted. Your draft is still available.");
      }
    }
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = currentDraft.trim();
    if (text === "" || onReply === undefined || currentResolved) return;
    if (optimisticReplies) {
      const id = `optimistic-${++sequence.current}`;
      setOptimistic((entries) => [...entries, { id, state: "pending", text }]);
      publishDraft("");
      void send(text, id);
    } else {
      void send(text);
    }
  };
  const insertMention = (suggestion: CommentMentionSuggestion) => {
    const next = currentDraft.replace(/(?:^|\s)@[^\s@]*$/u, (match) => {
      const prefix = match.startsWith(" ") ? " " : "";
      return `${prefix}@${suggestion.value} `;
    });
    publishDraft(next);
  };

  return (
    <div
      {...props}
      aria-label={label}
      className={className === undefined ? "mrg-comment-thread" : `mrg-comment-thread ${className}`}
      data-resolved={currentResolved}
      data-slot="comment-thread"
      ref={ref}
      role="region"
    >
      <div data-slot="comment-thread-header">
        <strong>{label}</strong>
        <span>{currentResolved ? "Resolved" : "Open"}</span>
        {onResolvedChange === undefined ? null : (
          <button onClick={() => publishResolved(!currentResolved)} type="button">
            {currentResolved ? "Reopen thread" : "Resolve thread"}
          </button>
        )}
      </div>
      <ol data-slot="comment-thread-comments">
        {comments.length === 0 && optimistic.length === 0 ? <li>{emptyContent}</li> : null}
        {comments.map((comment) => {
          const date = validTimestamp(comment.timestamp);
          return (
            <li key={comment.id}>
              <article>
                <header>
                  <strong>{comment.author}</strong>
                  <time dateTime={date.toISOString()}>{date.toLocaleString()}</time>
                </header>
                <div>{comment.body}</div>
                {comment.actions === undefined ? null : <footer>{comment.actions}</footer>}
              </article>
            </li>
          );
        })}
        {optimistic.map((reply) => (
          <li data-optimistic-state={reply.state} key={reply.id}>
            <article aria-busy={reply.state === "pending" || undefined}>
              <strong>You</strong>
              <p>{reply.text}</p>
              <span>{reply.state === "pending" ? "Posting…" : "Not posted"}</span>
              {reply.state === "error" ? (
                <div>
                  <button onClick={() => void send(reply.text, reply.id)} type="button">
                    Retry
                  </button>
                  <button
                    onClick={() =>
                      setOptimistic((entries) => entries.filter((entry) => entry.id !== reply.id))
                    }
                    type="button"
                  >
                    Discard
                  </button>
                </div>
              ) : null}
            </article>
          </li>
        ))}
      </ol>
      {currentResolved ? null : (
        <form data-slot="comment-thread-reply" onSubmit={submit}>
          <label>
            <span>Reply</span>
            <textarea
              disabled={onReply === undefined}
              onChange={(event) => publishDraft(event.currentTarget.value)}
              value={currentDraft}
            />
          </label>
          {visibleMentions.length > 0 ? (
            <div aria-label="Mention suggestions" data-slot="comment-thread-mentions">
              {visibleMentions.map((suggestion) => (
                <button key={suggestion.id} onClick={() => insertMention(suggestion)} type="button">
                  @{suggestion.label}
                </button>
              ))}
            </div>
          ) : null}
          {error === "" ? null : <p role="alert">{error}</p>}
          <button disabled={currentDraft.trim() === "" || onReply === undefined} type="submit">
            Post reply
          </button>
        </form>
      )}
    </div>
  );
});

CommentThread.displayName = "CommentThread";
