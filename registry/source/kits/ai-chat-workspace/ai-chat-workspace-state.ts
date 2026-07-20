"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type {
  AiChatWorkspaceAdapter,
  AiChatWorkspaceMessage,
  AiChatWorkspaceSnapshot,
} from "./ai-chat-workspace-adapter.js";

export type AiChatWorkspaceLoadState = "empty" | "error" | "loading" | "offline" | "ready";

export interface UseAiChatWorkspaceOptions {
  /** Consumer adapter that owns model, network, storage, privacy, and safety behavior. */
  readonly adapter: AiChatWorkspaceAdapter;
  /** Preferred initial conversation identifier after the snapshot loads. */
  readonly defaultConversationId?: string;
  /** Prevents load and send requests while keeping existing local content readable. */
  readonly offline?: boolean;
}

function isAsyncIterable(
  value: Promise<AiChatWorkspaceMessage> | AsyncIterable<AiChatWorkspaceMessage>,
): value is AsyncIterable<AiChatWorkspaceMessage> {
  return Symbol.asyncIterator in value;
}

export function useAiChatWorkspace({
  adapter,
  defaultConversationId,
  offline = false,
}: UseAiChatWorkspaceOptions) {
  const [snapshot, setSnapshot] = useState<AiChatWorkspaceSnapshot | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(
    defaultConversationId ?? null,
  );
  const [state, setState] = useState<AiChatWorkspaceLoadState>(offline ? "offline" : "loading");
  const [error, setError] = useState("");
  const activeLoad = useRef<AbortController | null>(null);
  const activeSend = useRef<AbortController | null>(null);
  const localMessageSequence = useRef(0);

  const reload = useCallback(async () => {
    if (offline) {
      setState("offline");
      return;
    }
    activeLoad.current?.abort();
    const controller = new AbortController();
    activeLoad.current = controller;
    setState("loading");
    setError("");
    try {
      const next = await adapter.load(controller.signal);
      setSnapshot(next);
      setConversationId((current) => current ?? next.conversations[0]?.id ?? null);
      setState(next.conversations.length === 0 ? "empty" : "ready");
    } catch (loadError) {
      if (controller.signal.aborted) return;
      setError(loadError instanceof Error ? loadError.message : "The workspace could not load.");
      setState("error");
    } finally {
      if (activeLoad.current === controller) activeLoad.current = null;
    }
  }, [adapter, offline]);

  useEffect(() => {
    void reload();
    return () => {
      activeLoad.current?.abort();
      activeSend.current?.abort();
    };
  }, [reload]);

  const upsertMessage = (targetId: string, message: AiChatWorkspaceMessage) => {
    setSnapshot((current) => {
      if (current === null) return current;
      const messages = current.messagesByConversation[targetId] ?? [];
      const index = messages.findIndex((entry) => entry.id === message.id);
      const next =
        index < 0
          ? [...messages, message]
          : messages.map((entry) => (entry.id === message.id ? message : entry));
      return {
        ...current,
        messagesByConversation: { ...current.messagesByConversation, [targetId]: next },
      };
    });
  };

  const send = async (text: string, attachments: readonly string[] = []) => {
    if (conversationId === null || offline || text.trim() === "") return;
    const controller = new AbortController();
    activeSend.current?.abort();
    activeSend.current = controller;
    localMessageSequence.current += 1;
    const localId = `local-user-${conversationId}-${localMessageSequence.current}`;
    const userMessage: AiChatWorkspaceMessage = {
      createdAt: new Date().toISOString(),
      id: localId,
      role: "user",
      segments: [{ id: `${localId}-1`, text }],
      status: "complete",
    };
    upsertMessage(conversationId, userMessage);
    try {
      const response = adapter.send({ attachments, conversationId, text }, controller.signal);
      if (isAsyncIterable(response)) {
        for await (const update of response) upsertMessage(conversationId, update);
      } else {
        upsertMessage(conversationId, await response);
      }
      setError("");
      setState("ready");
    } catch (sendError) {
      if (controller.signal.aborted) return;
      setError(sendError instanceof Error ? sendError.message : "The message could not be sent.");
      setState("error");
    } finally {
      if (activeSend.current === controller) activeSend.current = null;
    }
  };

  const cancel = async () => {
    activeSend.current?.abort();
    activeSend.current = null;
    if (conversationId !== null) await adapter.cancel?.(conversationId);
  };

  const retry = async (messageId: string) => {
    if (conversationId === null || adapter.retryMessage === undefined || offline) return;
    const controller = new AbortController();
    activeSend.current = controller;
    try {
      upsertMessage(
        conversationId,
        await adapter.retryMessage(conversationId, messageId, controller.signal),
      );
      setError("");
      setState("ready");
    } catch (retryError) {
      if (controller.signal.aborted) return;
      setError(retryError instanceof Error ? retryError.message : "The retry failed.");
      setState("error");
    } finally {
      if (activeSend.current === controller) activeSend.current = null;
    }
  };

  const edit = async (messageId: string, text: string) => {
    if (conversationId === null || adapter.editMessage === undefined || offline) return;
    await adapter.editMessage(conversationId, messageId, text);
  };

  const branch = async (messageId: string): Promise<string | null> => {
    if (conversationId === null || adapter.branchMessage === undefined || offline) return null;
    return adapter.branchMessage(conversationId, messageId);
  };

  return {
    adapter,
    branch,
    cancel,
    conversationId,
    edit,
    error,
    messages:
      conversationId === null ? [] : (snapshot?.messagesByConversation[conversationId] ?? []),
    reload,
    retry,
    selectConversation: setConversationId,
    send,
    snapshot,
    state,
  } as const;
}
