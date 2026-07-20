import type { ComponentProps } from "react";

import type { AuditLog } from "../../../registry/source/components/audit-log/audit-log.tsx";
import type { ChatComposer } from "../../../registry/source/components/chat-composer/chat-composer.tsx";
import type { MessageList } from "../../../registry/source/components/message-list/message-list.tsx";
import type { AiChatWorkspace } from "../../../registry/source/kits/ai-chat-workspace/ai-chat-workspace.tsx";

type Assert<T extends true> = T;
type HasFalse<T, K extends keyof T> = false extends NonNullable<T[K]> ? true : false;

type _ComposerValue = Assert<
  "value" extends keyof ComponentProps<typeof ChatComposer> ? true : false
>;
type _ListVirtualizationOff = Assert<
  HasFalse<ComponentProps<typeof MessageList<{ readonly id: string }>>, "virtualization">
>;
type _AuditFiltersOff = Assert<HasFalse<ComponentProps<typeof AuditLog>, "filtering">>;
type _KitAttachmentsOff = Assert<HasFalse<ComponentProps<typeof AiChatWorkspace>, "attachments">>;

export {};
