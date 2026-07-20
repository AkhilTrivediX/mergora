// Generated from registry/source/components/message-list/message-list.tsx by @mergora-internal/source-transformer. Do not edit.
"use client";

import "./message-list.css";

import {
  forwardRef,
  useEffect,
  useMemo,
  useRef,
  useState,
  type HTMLAttributes,
  type ReactNode,
  type UIEvent,
} from "react";

export type MessageListFollowMode = false | "instant" | "smooth";

export interface MessageListVirtualization {
  /** Positive fixed estimated message block size in CSS pixels. */
  readonly estimateSize: number;
  /** Additional message count rendered before and after the visible window. */
  readonly overscan?: number;
  /** Positive scroll viewport height in CSS pixels. */
  readonly viewportHeight: number;
}

export interface MessageListProps<Item> extends Omit<
  HTMLAttributes<HTMLDivElement>,
  "children" | "onScroll"
> {
  /** Adds delayed polite announcements for appended items; false removes the live region and timers. */
  readonly announceNewMessages?: boolean;
  /** Non-negative delay in milliseconds before enabled new-message announcements. */
  readonly announcementDelay?: number;
  /** Consumer empty-state content shown when the immutable collection is empty. */
  readonly emptyContent?: ReactNode;
  /** Enables instant or smooth output following; false keeps scrolling fully user-controlled. */
  readonly followOutput?: MessageListFollowMode;
  /** Returns a non-empty stable identifier for each message item. */
  readonly getItemId: (item: Item) => string;
  /** Builds localized enabled announcement copy from the appended item count. */
  readonly getNewMessageAnnouncement?: (count: number) => string;
  /** Ordered immutable message collection rendered by the consumer callback. */
  readonly items: readonly Item[];
  /** Required accessible name for the keyboard-scrollable message viewport. */
  readonly label: string;
  /** Reports whether automatic or user-requested following is currently active. */
  readonly onFollowStateChange?: (following: boolean) => void;
  /** Renders one message using its original collection index. */
  readonly renderItem: (item: Item, index: number) => ReactNode;
  /** Adds a jump-to-newest recovery action; false removes its UI and follow events. */
  readonly showFollowControl?: boolean;
  /** Enables bounded message rendering; false renders every item without virtual set semantics. */
  readonly virtualization?: false | MessageListVirtualization;
}

function defaultNewMessageAnnouncement(count: number): string {
  return `${count} new ${count === 1 ? "message" : "messages"}.`;
}

export const MessageList = forwardRef(function MessageList<Item>(
  {
    announceNewMessages = false,
    announcementDelay = 500,
    className,
    emptyContent = "No messages yet.",
    followOutput = false,
    getItemId,
    getNewMessageAnnouncement = defaultNewMessageAnnouncement,
    items,
    label,
    onFollowStateChange,
    renderItem,
    showFollowControl = false,
    style,
    virtualization = false,
    ...props
  }: MessageListProps<Item>,
  ref: React.ForwardedRef<HTMLDivElement>,
) {
  if (announcementDelay < 0 || !Number.isFinite(announcementDelay)) {
    throw new RangeError("Mergora MessageList announcementDelay must be non-negative.");
  }
  if (
    virtualization !== false &&
    (!Number.isFinite(virtualization.estimateSize) ||
      virtualization.estimateSize <= 0 ||
      !Number.isFinite(virtualization.viewportHeight) ||
      virtualization.viewportHeight <= 0)
  ) {
    throw new RangeError("Mergora MessageList virtualization sizes must be positive numbers.");
  }
  const viewport = useRef<HTMLDivElement | null>(null);
  const previousCount = useRef(items.length);
  const [scrollTop, setScrollTop] = useState(0);
  const [following, setFollowing] = useState(true);
  const [announcement, setAnnouncement] = useState("");
  const overscan = virtualization === false ? 0 : (virtualization.overscan ?? 3);
  const virtualWindow = useMemo(() => {
    if (virtualization === false) return { end: items.length, start: 0, total: 0 };
    const start = Math.max(0, Math.floor(scrollTop / virtualization.estimateSize) - overscan);
    const count = Math.ceil(virtualization.viewportHeight / virtualization.estimateSize);
    const end = Math.min(items.length, start + count + overscan * 2);
    return { end, start, total: items.length * virtualization.estimateSize };
  }, [items.length, overscan, scrollTop, virtualization]);
  const visibleItems = items.slice(virtualWindow.start, virtualWindow.end);

  const publishFollow = (next: boolean) => {
    setFollowing((current) => {
      if (current !== next) onFollowStateChange?.(next);
      return next;
    });
  };
  const scrollToEnd = (behavior: ScrollBehavior = "auto") => {
    const node = viewport.current;
    if (node === null) return;
    node.scrollTo({ behavior, top: node.scrollHeight });
    publishFollow(true);
  };
  const handleScroll = (event: UIEvent<HTMLDivElement>) => {
    const node = event.currentTarget;
    setScrollTop(node.scrollTop);
    if (followOutput !== false || showFollowControl) {
      publishFollow(node.scrollHeight - node.clientHeight - node.scrollTop <= 24);
    }
  };

  useEffect(() => {
    const added = Math.max(0, items.length - previousCount.current);
    previousCount.current = items.length;
    if (added === 0) return;
    if (followOutput !== false && following) {
      scrollToEnd(followOutput === "smooth" ? "smooth" : "auto");
    }
    if (!announceNewMessages) return;
    const timer = setTimeout(
      () => setAnnouncement(getNewMessageAnnouncement(added)),
      announcementDelay,
    );
    return () => clearTimeout(timer);
  }, [
    announceNewMessages,
    announcementDelay,
    followOutput,
    following,
    getNewMessageAnnouncement,
    items.length,
  ]);

  return (
    <div
      {...props}
      className={className === undefined ? "mrg-message-list" : `mrg-message-list ${className}`}
      data-following={followOutput === false ? undefined : following}
      data-slot="message-list"
      ref={ref}
      style={style}
    >
      <div
        aria-label={label}
        className="mrg-message-list__viewport"
        data-slot="message-list-viewport"
        onScroll={handleScroll}
        ref={viewport}
        style={
          virtualization === false
            ? undefined
            : { blockSize: virtualization.viewportHeight, overflowY: "auto" }
        }
        tabIndex={0}
      >
        {items.length === 0 ? (
          <p data-slot="message-list-empty">{emptyContent}</p>
        ) : (
          <ol
            data-slot="message-list-items"
            style={virtualization === false ? undefined : { blockSize: virtualWindow.total }}
          >
            {visibleItems.map((item, visibleIndex) => {
              const index = virtualWindow.start + visibleIndex;
              const id = getItemId(item);
              if (id.trim() === "") {
                throw new TypeError("Mergora MessageList item ids must not be empty.");
              }
              return (
                <li
                  aria-posinset={virtualization === false ? undefined : index + 1}
                  aria-setsize={virtualization === false ? undefined : items.length}
                  data-message-id={id}
                  key={id}
                  style={
                    virtualization === false
                      ? undefined
                      : {
                          blockSize: virtualization.estimateSize,
                          insetBlockStart: index * virtualization.estimateSize,
                          position: "absolute",
                        }
                  }
                >
                  {renderItem(item, index)}
                </li>
              );
            })}
          </ol>
        )}
      </div>
      {showFollowControl && !following ? (
        <button data-slot="message-list-follow" onClick={() => scrollToEnd()} type="button">
          Jump to newest message
        </button>
      ) : null}
      {announceNewMessages ? (
        <span aria-atomic="true" aria-live="polite" data-slot="message-list-announcement">
          {announcement}
        </span>
      ) : null}
    </div>
  );
}) as <Item>(
  props: MessageListProps<Item> & { readonly ref?: React.ForwardedRef<HTMLDivElement> },
) => React.ReactElement;
