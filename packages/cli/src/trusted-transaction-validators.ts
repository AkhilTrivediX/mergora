import { posix } from "node:path";

import postcss from "postcss";
import ts from "typescript";

import { canonicalJson, CliError } from "./contracts.js";
import type {
  TransactionValidationContext,
  TransactionValidationIssue,
  TransactionValidationResult,
  TransactionValidator,
} from "./transaction-engine.js";

const MAX_VALIDATION_FILES = 8192;
const MAX_VALIDATION_ISSUES = 128;

export interface TransactionMediaFile {
  readonly target: string;
  readonly mediaType: string;
}

export function transactionValidationResult(
  successSummary: string,
  failureSummary: string,
  issues: readonly TransactionValidationIssue[],
): TransactionValidationResult {
  const sorted = [...issues].sort(
    (left, right) =>
      left.target.localeCompare(right.target, "en-US") ||
      left.code.localeCompare(right.code, "en-US") ||
      left.message.localeCompare(right.message, "en-US"),
  );
  return sorted.length === 0
    ? { state: "pass", summary: successSummary }
    : {
        state: "fail",
        summary: failureSummary,
        issues: sorted.slice(0, MAX_VALIDATION_ISSUES),
      };
}

function scriptKind(file: TransactionMediaFile): ts.ScriptKind | null {
  const extension = posix.extname(file.target).toLocaleLowerCase("en-US");
  if (
    file.mediaType === "text/typescript-jsx" ||
    file.mediaType.includes("tsx") ||
    extension === ".tsx"
  ) {
    return ts.ScriptKind.TSX;
  }
  if (
    file.mediaType.includes("typescript") ||
    extension === ".ts" ||
    extension === ".mts" ||
    extension === ".cts"
  ) {
    return ts.ScriptKind.TS;
  }
  if (file.mediaType.includes("jsx") || extension === ".jsx") return ts.ScriptKind.JSX;
  if (
    file.mediaType.includes("javascript") ||
    file.mediaType.includes("ecmascript") ||
    [".js", ".mjs", ".cjs"].includes(extension)
  ) {
    return ts.ScriptKind.JS;
  }
  return null;
}

function fatalText(
  context: TransactionValidationContext,
  file: TransactionMediaFile,
  issues: TransactionValidationIssue[],
): string | null {
  const bytes = context.readFile(file.target);
  if (bytes === null) return null;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    issues.push({
      code: "MEDIA_UTF8_INVALID",
      target: file.target,
      message: `The declared ${file.mediaType} artifact is not valid UTF-8.`,
    });
    return null;
  }
}

function mediaParse(
  files: readonly TransactionMediaFile[],
  context: TransactionValidationContext,
): TransactionValidationResult {
  const issues: TransactionValidationIssue[] = [];
  let parsed = 0;
  for (const file of files) {
    const kind = scriptKind(file);
    const isJson = file.mediaType.includes("json") || file.target.endsWith(".json");
    const isCss = file.mediaType === "text/css" || file.target.endsWith(".css");
    const isText =
      kind !== null ||
      isJson ||
      isCss ||
      file.mediaType.startsWith("text/") ||
      file.mediaType === "image/svg+xml";
    if (!isText) continue;
    const text = fatalText(context, file, issues);
    if (text === null) continue;
    parsed += 1;
    try {
      if (isJson) {
        canonicalJson(JSON.parse(text) as unknown);
      } else if (isCss) {
        postcss.parse(text, { from: file.target });
      } else if (kind !== null) {
        const source = ts.createSourceFile(file.target, text, ts.ScriptTarget.Latest, true, kind);
        const diagnostics = (
          source as ts.SourceFile & { readonly parseDiagnostics?: readonly ts.Diagnostic[] }
        ).parseDiagnostics;
        for (const diagnostic of diagnostics ?? []) {
          issues.push({
            code: `TS_${diagnostic.code}`,
            target: file.target,
            message: ts.flattenDiagnosticMessageText(diagnostic.messageText, " ").slice(0, 1024),
          });
        }
      } else if (
        file.mediaType === "image/svg+xml" &&
        (!text.trimStart().startsWith("<svg") || !text.trimEnd().endsWith("</svg>"))
      ) {
        issues.push({
          code: "MEDIA_SVG_INVALID",
          target: file.target,
          message: "The SVG source does not have a complete svg document root.",
        });
      }
    } catch (error) {
      issues.push({
        code: "MEDIA_PARSE_INVALID",
        target: file.target,
        message:
          error instanceof Error
            ? `The declared ${file.mediaType} artifact does not parse: ${error.message}`.slice(
                0,
                1024,
              )
            : `The declared ${file.mediaType} artifact does not parse.`,
      });
    }
    if (issues.length >= MAX_VALIDATION_ISSUES) break;
  }
  return transactionValidationResult(
    `Parsed ${parsed} changed text artifacts in the ${context.phase} view.`,
    `Changed media parsing failed in the ${context.phase} view.`,
    issues,
  );
}

export function createMediaParseValidator(
  id: string,
  inputFiles: readonly TransactionMediaFile[],
): TransactionValidator {
  if (inputFiles.length > MAX_VALIDATION_FILES) {
    throw new CliError("Transaction media validation exceeds its deterministic file bound.", {
      code: "TRANSACTION_VALIDATION_LIMIT_EXCEEDED",
      exitCode: 8,
    });
  }
  const files = [...inputFiles]
    .sort((left, right) => left.target.localeCompare(right.target, "en-US"))
    .filter((file, index, values) => index === 0 || file.target !== values[index - 1]!.target);
  const validate = (context: TransactionValidationContext) => mediaParse(files, context);
  return {
    id,
    label: "parse",
    validateStagedOverlay: validate,
    validatePostCommit: validate,
  };
}
