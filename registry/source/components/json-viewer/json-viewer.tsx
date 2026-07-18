"use client";

import {
  forwardRef,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type HTMLAttributes,
  type KeyboardEvent,
} from "react";

import { useMergoraContext, useMergoraMessage } from "../provider/index.js";
import "./json-viewer.css";

export type JsonPrimitive = boolean | null | number | string;
export interface JsonObject {
  readonly [key: string]: JsonValue;
}
export type JsonValue = JsonPrimitive | JsonObject | readonly JsonValue[];
export type JsonValueType = "array" | "boolean" | "null" | "number" | "object" | "string";

export interface JsonTreeNode {
  readonly childPaths: readonly string[];
  readonly key: string;
  readonly level: number;
  readonly parentPath?: string;
  readonly path: string;
  readonly position: number;
  readonly setSize: number;
  readonly type: JsonValueType;
  readonly value: JsonValue;
}

export interface JsonViewerProps extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
  readonly activePath?: string;
  readonly copiedPathLabel?: string;
  readonly copiedValueLabel?: string;
  readonly copyErrorLabel?: string;
  readonly copyPathLabel?: string;
  readonly copyValueLabel?: string;
  readonly defaultActivePath?: string;
  readonly defaultExpandedDepth?: number;
  readonly expandedPaths?: readonly string[];
  readonly label: string;
  readonly onActivePathChange?: (path: string, value: JsonValue) => void;
  readonly onExpandedPathsChange?: (paths: readonly string[]) => void;
  readonly value: JsonValue;
}

type JsonRowStyle = CSSProperties & { readonly "--mrg-json-level": number };

function valueType(value: JsonValue): JsonValueType {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value as Exclude<JsonValueType, "array" | "null">;
}

function childPath(parentPath: string, key: string, isArray: boolean): string {
  if (isArray) return `${parentPath}[${key}]`;
  return /^[A-Za-z_$][\w$]*$/u.test(key)
    ? `${parentPath}.${key}`
    : `${parentPath}[${JSON.stringify(key)}]`;
}

export function buildJsonTree(value: JsonValue): readonly JsonTreeNode[] {
  const nodes: JsonTreeNode[] = [];
  const ancestors = new WeakSet<object>();

  const append = (
    item: JsonValue,
    key: string,
    path: string,
    level: number,
    position: number,
    setSize: number,
    parentPath?: string,
  ): void => {
    const type = valueType(item);
    const entries =
      type === "array"
        ? (item as readonly JsonValue[]).map((child, index) => [String(index), child] as const)
        : type === "object"
          ? Object.entries(item as JsonObject)
          : [];
    const isReference = typeof item === "object" && item !== null;
    const circular = isReference && ancestors.has(item);
    const childPaths = circular
      ? []
      : entries.map(([childKey]) => childPath(path, childKey, type === "array"));
    nodes.push({
      childPaths,
      key,
      level,
      ...(parentPath === undefined ? {} : { parentPath }),
      path,
      position,
      setSize,
      type,
      value: item,
    });
    if (circular || entries.length === 0) return;
    if (isReference) ancestors.add(item);
    entries.forEach(([childKey, child], index) => {
      append(
        child,
        childKey,
        childPath(path, childKey, type === "array"),
        level + 1,
        index + 1,
        entries.length,
        path,
      );
    });
    if (isReference) ancestors.delete(item);
  };

  append(value, "root", "$", 1, 1, 1);
  return nodes;
}

export function serializeJsonValue(value: JsonValue): string {
  if (typeof value === "string") return value;
  const ancestors = new WeakSet<object>();
  const normalize = (item: unknown): unknown => {
    if (typeof item !== "object" || item === null) return item;
    if (ancestors.has(item)) return "[Circular]";
    ancestors.add(item);
    try {
      if (Array.isArray(item)) return item.map((entry) => normalize(entry));
      return Object.fromEntries(
        Object.entries(item).map(([key, entry]) => [key, normalize(entry)]),
      );
    } finally {
      ancestors.delete(item);
    }
  };
  const serialized = JSON.stringify(normalize(value), null, 2);
  return serialized ?? String(value);
}

function displayValue(node: JsonTreeNode): string {
  if (node.type === "array") return `[${String(node.childPaths.length)}]`;
  if (node.type === "object") return `{${String(node.childPaths.length)}}`;
  if (node.type === "string") return JSON.stringify(node.value);
  return String(node.value);
}

function visibleJsonNodes(
  nodes: readonly JsonTreeNode[],
  expanded: ReadonlySet<string>,
): readonly JsonTreeNode[] {
  const byPath = new Map(nodes.map((node) => [node.path, node] as const));
  return nodes.filter((node) => {
    let parent = node.parentPath;
    while (parent !== undefined) {
      if (!expanded.has(parent)) return false;
      parent = byPath.get(parent)?.parentPath;
    }
    return true;
  });
}

async function writeJsonClipboard(value: string): Promise<void> {
  if (typeof navigator !== "undefined" && navigator.clipboard !== undefined) {
    await navigator.clipboard.writeText(value);
    return;
  }
  if (typeof document === "undefined") throw new Error("Clipboard is unavailable.");
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.insetInlineStart = "-10000px";
  document.body.append(textarea);
  try {
    textarea.select();
    const copied = document.execCommand("copy");
    if (!copied) throw new Error("Clipboard copy was rejected.");
  } finally {
    textarea.remove();
  }
}

export const JsonViewer = forwardRef<HTMLDivElement, JsonViewerProps>(function JsonViewer(
  {
    activePath,
    className,
    copiedPathLabel: copiedPathLabelProp,
    copiedValueLabel: copiedValueLabelProp,
    copyErrorLabel: copyErrorLabelProp,
    copyPathLabel: copyPathLabelProp,
    copyValueLabel: copyValueLabelProp,
    defaultActivePath = "$",
    defaultExpandedDepth = 1,
    expandedPaths,
    label,
    onActivePathChange,
    onExpandedPathsChange,
    value,
    ...nativeProps
  },
  forwardedRef,
) {
  const nodes = useMemo(() => buildJsonTree(value), [value]);
  const initiallyExpanded = useMemo(
    () =>
      nodes
        .filter((node) => node.childPaths.length > 0 && node.level <= defaultExpandedDepth)
        .map((node) => node.path),
    [defaultExpandedDepth, nodes],
  );
  const [uncontrolledExpanded, setUncontrolledExpanded] =
    useState<readonly string[]>(initiallyExpanded);
  const [uncontrolledActive, setUncontrolledActive] = useState(defaultActivePath);
  const [copyStatus, setCopyStatus] = useState<"idle" | "path" | "value" | "error">("idle");
  const rowRefs = useRef(new Map<string, HTMLDivElement>());
  const statusId = useId();
  const { getMessage } = useMergoraContext();
  const defaultCopiedPathLabel = useMergoraMessage("jsonViewer.copiedPath", "Path copied");
  const defaultCopiedValueLabel = useMergoraMessage("jsonViewer.copiedValue", "Value copied");
  const defaultCopyErrorLabel = useMergoraMessage("jsonViewer.copyError", "Copy failed");
  const defaultCopyPathLabel = useMergoraMessage("jsonViewer.copyPath", "Copy selected path");
  const defaultCopyValueLabel = useMergoraMessage("jsonViewer.copyValue", "Copy selected value");
  const copiedPathLabel = copiedPathLabelProp ?? defaultCopiedPathLabel;
  const copiedValueLabel = copiedValueLabelProp ?? defaultCopiedValueLabel;
  const copyErrorLabel = copyErrorLabelProp ?? defaultCopyErrorLabel;
  const copyPathLabel = copyPathLabelProp ?? defaultCopyPathLabel;
  const copyValueLabel = copyValueLabelProp ?? defaultCopyValueLabel;
  const treeLabel = useMergoraMessage("jsonViewer.tree", "{label} tree", { label });
  const rootKeyLabel = useMergoraMessage("jsonViewer.rootKey", "root");
  const expandedLabel = useMergoraMessage("jsonViewer.expanded", "expanded");
  const collapsedLabel = useMergoraMessage("jsonViewer.collapsed", "collapsed");
  const typeLabels: Readonly<Record<JsonValueType, string>> = {
    array: useMergoraMessage("jsonViewer.type.array", "array"),
    boolean: useMergoraMessage("jsonViewer.type.boolean", "boolean"),
    null: useMergoraMessage("jsonViewer.type.null", "null"),
    number: useMergoraMessage("jsonViewer.type.number", "number"),
    object: useMergoraMessage("jsonViewer.type.object", "object"),
    string: useMergoraMessage("jsonViewer.type.string", "string"),
  };
  const expanded = useMemo(
    () => new Set(expandedPaths ?? uncontrolledExpanded),
    [expandedPaths, uncontrolledExpanded],
  );
  const visibleNodes = visibleJsonNodes(nodes, expanded);
  const requestedActive = activePath ?? uncontrolledActive;
  const currentNode =
    visibleNodes.find((node) => node.path === requestedActive) ?? visibleNodes[0] ?? nodes[0];
  const currentPath = currentNode?.path ?? "$";

  const updateExpanded = (next: ReadonlySet<string>): void => {
    const ordered = nodes.filter((node) => next.has(node.path)).map((node) => node.path);
    if (expandedPaths === undefined) setUncontrolledExpanded(ordered);
    onExpandedPathsChange?.(ordered);
  };

  const toggle = (node: JsonTreeNode, force?: boolean): void => {
    if (node.childPaths.length === 0) return;
    const next = new Set(expanded);
    const shouldExpand = force ?? !next.has(node.path);
    if (shouldExpand) next.add(node.path);
    else next.delete(node.path);
    updateExpanded(next);
  };

  const select = (node: JsonTreeNode, focus = true): void => {
    if (activePath === undefined) setUncontrolledActive(node.path);
    onActivePathChange?.(node.path, node.value);
    if (focus) {
      rowRefs.current.get(node.path)?.focus({ preventScroll: true });
      rowRefs.current.get(node.path)?.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  };

  const onTreeKeyDown = (event: KeyboardEvent<HTMLDivElement>, node: JsonTreeNode): void => {
    const index = visibleNodes.findIndex((entry) => entry.path === node.path);
    let destination: JsonTreeNode | undefined;
    switch (event.key) {
      case "*": {
        const siblings = nodes.filter((entry) => entry.parentPath === node.parentPath);
        const next = new Set(expanded);
        siblings.forEach((entry) => {
          if (entry.childPaths.length > 0) next.add(entry.path);
        });
        updateExpanded(next);
        event.preventDefault();
        return;
      }
      case " ":
      case "Enter":
        toggle(node);
        event.preventDefault();
        return;
      case "ArrowDown":
        destination = visibleNodes[index + 1];
        break;
      case "ArrowLeft":
        if (node.childPaths.length > 0 && expanded.has(node.path)) toggle(node, false);
        else if (node.parentPath !== undefined)
          destination = nodes.find((entry) => entry.path === node.parentPath);
        break;
      case "ArrowRight":
        if (node.childPaths.length > 0 && !expanded.has(node.path)) toggle(node, true);
        else if (node.childPaths.length > 0)
          destination = nodes.find((entry) => entry.path === node.childPaths[0]);
        break;
      case "ArrowUp":
        destination = visibleNodes[index - 1];
        break;
      case "End":
        destination = visibleNodes.at(-1);
        break;
      case "Home":
        destination = visibleNodes[0];
        break;
      default:
        return;
    }
    event.preventDefault();
    if (destination !== undefined) select(destination);
  };

  const copy = async (kind: "path" | "value"): Promise<void> => {
    if (currentNode === undefined) return;
    try {
      await writeJsonClipboard(
        kind === "path" ? currentNode.path : serializeJsonValue(currentNode.value),
      );
      setCopyStatus(kind);
    } catch {
      setCopyStatus("error");
    }
  };

  return (
    <div
      {...nativeProps}
      ref={forwardedRef}
      aria-label={label}
      className={
        className === undefined || className.trim().length === 0
          ? "mrg-json-viewer"
          : `mrg-json-viewer ${className}`
      }
      data-slot="json-viewer"
      data-virtualized="false"
      role="region"
    >
      <div data-slot="json-toolbar">
        <strong>{label}</strong>
        <code data-slot="json-active-path">{currentPath}</code>
        <button
          aria-describedby={statusId}
          data-slot="json-copy-path"
          onClick={() => void copy("path")}
          type="button"
        >
          {copyPathLabel}
        </button>
        <button
          aria-describedby={statusId}
          data-slot="json-copy-value"
          onClick={() => void copy("value")}
          type="button"
        >
          {copyValueLabel}
        </button>
      </div>
      <div aria-label={treeLabel} data-slot="json-tree" role="tree">
        {visibleNodes.map((node) => {
          const expandable = node.childPaths.length > 0;
          const isExpanded = expandable && expanded.has(node.path);
          const selected = node.path === currentPath;
          const state = expandable
            ? isExpanded
              ? expandedLabel
              : collapsedLabel
            : displayValue(node);
          const keyLabel = node.path === "$" ? rootKeyLabel : node.key;
          const nodeLabel = getMessage("jsonViewer.node", "{key}, {type}, {state}", {
            key: keyLabel,
            state,
            type: typeLabels[node.type],
          });
          const pathDescription = getMessage("jsonViewer.path", "Path {path}.", {
            path: node.path,
          });
          const style: JsonRowStyle = { "--mrg-json-level": node.level };
          return (
            <div
              aria-expanded={expandable ? isExpanded : undefined}
              aria-label={nodeLabel}
              aria-level={node.level}
              aria-posinset={node.position}
              aria-selected={selected}
              aria-setsize={node.setSize}
              data-expanded={expandable ? (isExpanded ? "true" : "false") : undefined}
              data-path={node.path}
              data-slot="json-tree-item"
              data-type={node.type}
              key={node.path}
              onClick={() => {
                select(node, false);
                toggle(node);
              }}
              onFocus={() => select(node, false)}
              onKeyDown={(event) => onTreeKeyDown(event, node)}
              ref={(element) => {
                if (element === null) rowRefs.current.delete(node.path);
                else rowRefs.current.set(node.path, element);
              }}
              role="treeitem"
              style={style}
              tabIndex={selected ? 0 : -1}
            >
              <span aria-hidden="true" data-slot="json-disclosure">
                {expandable ? (isExpanded ? "▾" : "▸") : "·"}
              </span>
              <code data-slot="json-key">{keyLabel}</code>
              <span aria-hidden="true" data-slot="json-separator">
                :
              </span>
              <code data-slot="json-value">{displayValue(node)}</code>
              <span className="mrg-json-sr-only"> {pathDescription}</span>
            </div>
          );
        })}
      </div>
      <span className="mrg-json-sr-only" id={statusId} role="status">
        {copyStatus === "path"
          ? copiedPathLabel
          : copyStatus === "value"
            ? copiedValueLabel
            : copyStatus === "error"
              ? copyErrorLabel
              : ""}
      </span>
    </div>
  );
});

JsonViewer.displayName = "JsonViewer";
