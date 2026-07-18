export type JsonPrimitive = null | boolean | number | string;
export type JsonValue = JsonPrimitive | readonly JsonValue[] | JsonObject;
export interface JsonObject {
  readonly [key: string]: JsonValue;
}

export interface McpInputSchema {
  readonly type: "object";
  readonly additionalProperties: false;
  readonly properties: Readonly<Record<string, JsonObject>>;
  readonly required?: readonly string[] | undefined;
}

export interface MergoraMcpTool {
  readonly name: string;
  readonly title: string;
  readonly description: string;
  readonly inputSchema: McpInputSchema;
  readonly annotations: {
    readonly readOnlyHint: true;
    readonly destructiveHint: false;
    readonly idempotentHint: true;
    readonly openWorldHint: boolean;
  };
}

export interface MergoraMcpResource {
  readonly uri: `mergora://${string}`;
  readonly name: string;
  readonly title: string;
  readonly description: string;
  readonly mimeType: "application/json";
}

export interface MergoraMcpContent {
  readonly type: "text";
  readonly text: string;
}

export interface MergoraMcpSuccess {
  readonly isError: false;
  readonly content: readonly MergoraMcpContent[];
  readonly structuredContent: unknown;
}

export interface MergoraMcpFailure {
  readonly isError: true;
  readonly content: readonly MergoraMcpContent[];
  readonly structuredContent: {
    readonly schemaVersion: 1;
    readonly ok: false;
    readonly error: {
      readonly code: string;
      readonly message: string;
      readonly target?: string | undefined;
    };
  };
}

export type MergoraMcpToolResult = MergoraMcpSuccess | MergoraMcpFailure;

export interface MergoraMcpResourceResult {
  readonly contents: readonly {
    readonly uri: string;
    readonly mimeType: "application/json";
    readonly text: string;
  }[];
}

export type MergoraMcpCoreRequest =
  | { readonly id: number | string | null; readonly method: "ping" }
  | { readonly id: number | string | null; readonly method: "tools/list" }
  | {
      readonly id: number | string | null;
      readonly method: "tools/call";
      readonly params: { readonly name: string; readonly arguments?: unknown | undefined };
    }
  | { readonly id: number | string | null; readonly method: "resources/list" }
  | {
      readonly id: number | string | null;
      readonly method: "resources/read";
      readonly params: { readonly uri: string };
    };

export interface MergoraMcpCoreResponse {
  readonly id: number | string | null;
  readonly ok: boolean;
  readonly result?: unknown;
  readonly error?: { readonly code: string; readonly message: string };
}

export interface MergoraMcpServer {
  readonly id: "mergora.mcp.core.v1";
  readonly defaultCapability: "read-or-plan-only";
  readonly applyCapability: false;
  listTools(): readonly MergoraMcpTool[];
  callTool(name: string, input?: unknown): Promise<MergoraMcpToolResult>;
  listResources(): readonly MergoraMcpResource[];
  readResource(uri: string): Promise<MergoraMcpResourceResult>;
  handleRequest(request: unknown): Promise<MergoraMcpCoreResponse>;
  handleLine(line: string): Promise<string>;
}

export interface MergoraMcpLineTransportOptions {
  readonly input: AsyncIterable<string | Uint8Array>;
  readonly write: (line: string) => Promise<void> | void;
  readonly server?: MergoraMcpServer | undefined;
}
