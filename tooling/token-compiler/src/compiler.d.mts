export interface CompileWorkspaceOptions {
  assetsDirectory?: string;
  generatedDirectory?: string;
  mode?: "check" | "memory" | "write";
  packageIndexPath?: string;
  sourceDirectory?: string;
  workspaceRoot?: string;
}

export interface CompiledToken {
  description?: string;
  extensions?: Record<string, unknown>;
  path: string;
  rawValue: unknown;
  reference?: string;
  resolvedValue: unknown;
  type: string;
}

export interface CompileWorkspaceResult {
  artifacts: Map<string, string>;
  contexts: Map<string, Map<string, CompiledToken>>;
  contrastEvidence: Array<Record<string, unknown>>;
  drift: string[];
  tokenCount: number;
}

export const defaultWorkspaceRoot: string;
export function stableJson(value: unknown): string;
export function flattenTokenDocument(
  document: Record<string, unknown>,
  label?: string,
): Map<string, CompiledToken>;
export function resolveTokenDocument(
  document: Record<string, unknown>,
  label?: string,
): Map<string, CompiledToken>;
export function contrastRatio(
  foreground: Record<string, unknown>,
  background: Record<string, unknown>,
): number;
export function tokenValueToCss(type: string, value: unknown): string;
export function cssVariableName(path: string, prefix?: string): string;
export function compileWorkspace(options?: CompileWorkspaceOptions): CompileWorkspaceResult;
