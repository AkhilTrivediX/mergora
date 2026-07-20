// Generated from registry/source/components/query-builder/query-builder.tsx by @mergora-internal/source-transformer. Do not edit.
"use client";

import "./query-builder.css";

import {
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type HTMLAttributes,
  type ReactElement,
  type ReactNode,
} from "react";

export interface QueryBuilderOperator {
  /** Provides the stable operator value stored in each condition. */
  readonly id: string;
  /** Presents the operator name in selectors and summaries. */
  readonly label: string;
  /** Removes the value editor when false, for operators such as “is empty”. */
  readonly requiresValue?: boolean;
}

export interface QueryBuilderField {
  /** Provides the stable field value stored in each condition. */
  readonly id: string;
  /** Presents the field name in selectors, summaries, and recovery messages. */
  readonly label: string;
  /** Restricts the operator selector to choices valid for this field. */
  readonly operators: readonly QueryBuilderOperator[];
  /** Replaces the default text input for this field while retaining canonical string values. */
  readonly renderValue?: (props: QueryBuilderValueEditorProps) => ReactNode;
}

export interface QueryBuilderValueEditorProps {
  /** Supplies the complete condition being edited by a custom value control. */
  readonly condition: QueryBuilderCondition;
  /** Tells the custom editor to prevent value changes. */
  readonly disabled: boolean;
  /** Indicates that the current canonical value needs recovery. */
  readonly invalid: boolean;
  /** Commits a canonical string value from the custom editor. */
  readonly onValueChange: (value: string) => void;
}

export interface QueryBuilderCondition {
  /** Provides the stable node identifier used for nested updates and rendering. */
  readonly id: string;
  /** Discriminates this node so consumers can distinguish conditions from nested groups. */
  readonly kind: "condition";
  /** References a field identifier supplied through the fields collection. */
  readonly field: string;
  /** References an operator valid for the selected field. */
  readonly operator: string;
  /** Stores the canonical consumer value without imposing domain-specific parsing. */
  readonly value: string;
}

export interface QueryBuilderGroup {
  /** Provides the stable node identifier used for nested updates and rendering. */
  readonly id: string;
  /** Discriminates this node so consumers can distinguish conditions from nested groups. */
  readonly kind: "group";
  /** Chooses whether every child or any child must match. */
  readonly combinator: "and" | "or";
  /** Supplies ordered condition and nested-group children. */
  readonly children: readonly QueryBuilderNode[];
}

export type QueryBuilderNode = QueryBuilderCondition | QueryBuilderGroup;
export type QueryBuilderChangeReason =
  "add-condition" | "add-group" | "remove" | "update" | "reorder" | "reset";

export interface QueryBuilderMessages {
  /** Labels the action that appends a leaf condition. */
  readonly addCondition: string;
  /** Labels the action that appends a nested condition group. */
  readonly addGroup: string;
  /** Labels the combinator requiring every child to match. */
  readonly and: string;
  /** Labels the combinator requiring any child to match. */
  readonly or: string;
  /** Labels each condition’s field selector. */
  readonly field: string;
  /** Labels each condition’s operator selector. */
  readonly operator: string;
  /** Labels each condition’s canonical value editor. */
  readonly value: string;
  /** Labels the action that removes a condition or group. */
  readonly remove: string;
  /** Labels the action that moves a node earlier among its siblings. */
  readonly moveUp: string;
  /** Labels the action that moves a node later among its siblings. */
  readonly moveDown: string;
  /** Describes a query that contains no conditions. */
  readonly empty: string;
  /** Names the optional plain-language query summary. */
  readonly summary: string;
  /** Names the recovery list produced by validation. */
  readonly errors: string;
  /** Labels each group’s all-versus-any selector. */
  readonly matchPolicy: string;
  /** Generates an accessible name for a group at the given one-based position. */
  readonly groupLabel: (position: number) => string;
  /** Generates the accessible name for one condition’s action group. */
  readonly conditionActions: (position: number) => string;
  /** Generates the root action label from the query label. */
  readonly addToRoot: (label: string) => string;
  /** Generates a nested group action label from its one-based position. */
  readonly addToGroup: (position: number) => string;
  /** Explains how to recover an incomplete condition. */
  readonly conditionRecovery: string;
  /** Generates recovery text for an unknown field identifier. */
  readonly invalidField: (id: string) => string;
  /** Generates recovery text for an operator invalid for its field. */
  readonly invalidOperator: (id: string) => string;
  /** Generates recovery text for a condition missing a required value. */
  readonly missingValue: (id: string) => string;
  /** Represents an empty query in the optional plain-language summary. */
  readonly noConditions: string;
  /** Joins children of an all-conditions group in the optional summary. */
  readonly summaryAnd: string;
  /** Joins children of an any-condition group in the optional summary. */
  readonly summaryOr: string;
  /** Replaces an absent condition value in the optional summary. */
  readonly missingSummaryValue: string;
}

export interface QueryBuilderProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  "children" | "defaultValue" | "onChange"
> {
  /** Names the query builder for visible and assistive-technology context. */
  readonly label: string;
  /** Defines selectable fields, operators, and optional custom value editors. */
  readonly fields: readonly QueryBuilderField[];
  /** Controls the complete root query group when supplied. */
  readonly value?: QueryBuilderGroup;
  /** Sets the initial root query group for uncontrolled use. */
  readonly defaultValue?: QueryBuilderGroup;
  /** Reports structural and value changes with the operation and affected node. */
  readonly onValueChange?: (
    value: QueryBuilderGroup,
    detail: { readonly reason: QueryBuilderChangeReason; readonly nodeId: string },
  ) => void;
  /** Serializes the root query into a hidden successful control for native form submission. */
  readonly name?: string;
  /** Prevents condition, group, ordering, and value changes. */
  readonly disabled?: boolean;
  /** Preserves values and form submission while removing mutating controls. */
  readonly readOnly?: boolean;
  /** Limits nested groups while still permitting conditions at the deepest level. */
  readonly maximumDepth?: number;
  /** Adds consumer validation messages to the built-in structural recovery output. */
  readonly validate?: (value: QueryBuilderGroup) => readonly string[];
  /** Shows a plain-language query summary; false removes its UI and semantics. */
  readonly showSummary?: boolean;
  /** Replaces the optional default summary without changing the canonical query. */
  readonly renderSummary?: (value: QueryBuilderGroup) => ReactNode;
  /** Overrides individual localized strings while retaining defaults for omitted entries. */
  readonly messages?: Partial<QueryBuilderMessages>;
}

const defaultMessages: QueryBuilderMessages = {
  addCondition: "Add condition",
  addGroup: "Add group",
  and: "All conditions",
  or: "Any condition",
  field: "Field",
  operator: "Operator",
  value: "Value",
  remove: "Remove",
  moveUp: "Move up",
  moveDown: "Move down",
  empty: "No conditions yet.",
  summary: "Query summary",
  errors: "Query problems",
  matchPolicy: "Match policy",
  groupLabel: (position) => `Condition group ${position}`,
  conditionActions: (position) => `Actions for condition ${position}`,
  addToRoot: (label) => `Add to ${label}`,
  addToGroup: (position) => `Add to group ${position}`,
  conditionRecovery:
    "Choose an available field and operator, then enter the value this condition needs.",
  invalidField: (id) => `Condition ${id} needs a valid field.`,
  invalidOperator: (id) => `Condition ${id} needs a valid operator.`,
  missingValue: (id) => `Condition ${id} needs a value.`,
  noConditions: "No conditions",
  summaryAnd: "and",
  summaryOr: "or",
  missingSummaryValue: "...",
};

function classes(...values: readonly (string | undefined | false)[]): string {
  return values.filter((value): value is string => Boolean(value)).join(" ");
}

export function createEmptyQueryGroup(id = "root"): QueryBuilderGroup {
  return { id, kind: "group", combinator: "and", children: [] };
}

function collectQueryNodeIds(node: QueryBuilderNode, ids: string[] = []): readonly string[] {
  ids.push(node.id);
  if (node.kind === "group") node.children.forEach((child) => collectQueryNodeIds(child, ids));
  return ids;
}

export function serializeQuery(value: QueryBuilderGroup): string {
  const normalize = (node: QueryBuilderNode): object =>
    node.kind === "condition"
      ? {
          id: node.id,
          kind: node.kind,
          field: node.field,
          operator: node.operator,
          value: node.value,
        }
      : {
          id: node.id,
          kind: node.kind,
          combinator: node.combinator,
          children: node.children.map(normalize),
        };
  return JSON.stringify(normalize(value));
}

export function parseQuery(serialized: string): QueryBuilderGroup {
  if (serialized.length > 65_536) {
    throw new Error("Mergora QueryBuilder serialized query exceeds the supported size.");
  }
  const parsed: unknown = JSON.parse(serialized);
  let nodeCount = 0;
  const parseNode = (candidate: unknown, depth: number): QueryBuilderNode => {
    nodeCount += 1;
    if (depth > 20 || nodeCount > 1000 || typeof candidate !== "object" || candidate === null) {
      throw new Error("Mergora QueryBuilder received an invalid serialized query.");
    }
    const value = candidate as Record<string, unknown>;
    if (value.kind === "condition") {
      if (
        typeof value.id !== "string" ||
        value.id.length === 0 ||
        value.id.length > 120 ||
        typeof value.field !== "string" ||
        typeof value.operator !== "string" ||
        typeof value.value !== "string"
      ) {
        throw new Error("Mergora QueryBuilder received an invalid condition.");
      }
      return {
        id: value.id,
        kind: "condition",
        field: value.field,
        operator: value.operator,
        value: value.value,
      };
    }
    if (
      value.kind !== "group" ||
      typeof value.id !== "string" ||
      value.id.length === 0 ||
      value.id.length > 120 ||
      (value.combinator !== "and" && value.combinator !== "or") ||
      !Array.isArray(value.children)
    ) {
      throw new Error("Mergora QueryBuilder received an invalid group.");
    }
    return {
      id: value.id,
      kind: "group",
      combinator: value.combinator,
      children: value.children.map((child) => parseNode(child, depth + 1)),
    };
  };
  const result = parseNode(parsed, 0);
  if (result.kind !== "group") {
    throw new Error("Mergora QueryBuilder root must be a group.");
  }
  const ids = collectQueryNodeIds(result);
  if (new Set(ids).size !== ids.length) {
    throw new Error("Mergora QueryBuilder serialized node IDs must be unique.");
  }
  return result;
}

export function formatQuerySummary(
  value: QueryBuilderGroup,
  fields: readonly QueryBuilderField[],
  messageOverrides: Partial<
    Pick<QueryBuilderMessages, "missingSummaryValue" | "noConditions" | "summaryAnd" | "summaryOr">
  > = {},
): string {
  const messages = { ...defaultMessages, ...messageOverrides };
  const fieldMap = new Map(fields.map((field) => [field.id, field]));
  const format = (node: QueryBuilderNode): string => {
    if (node.kind === "group") {
      if (node.children.length === 0) return messages.noConditions;
      const connector = node.combinator === "and" ? messages.summaryAnd : messages.summaryOr;
      return `(${node.children.map(format).join(` ${connector} `)})`;
    }
    const field = fieldMap.get(node.field);
    const operator = field?.operators.find((item) => item.id === node.operator);
    const suffix =
      operator?.requiresValue === false ? "" : ` ${node.value || messages.missingSummaryValue}`;
    return `${field?.label ?? node.field} ${operator?.label ?? node.operator}${suffix}`;
  };
  return format(value);
}

function replaceGroup(
  root: QueryBuilderGroup,
  groupId: string,
  update: (group: QueryBuilderGroup) => QueryBuilderGroup,
): QueryBuilderGroup {
  if (root.id === groupId) return update(root);
  return {
    ...root,
    children: root.children.map((child) =>
      child.kind === "group" ? replaceGroup(child, groupId, update) : child,
    ),
  };
}

function replaceNode(
  root: QueryBuilderGroup,
  nodeId: string,
  update: (node: QueryBuilderNode) => QueryBuilderNode,
): QueryBuilderGroup {
  return {
    ...root,
    children: root.children.map((child) => {
      if (child.id === nodeId) return update(child);
      return child.kind === "group" ? replaceNode(child, nodeId, update) : child;
    }),
  };
}

function removeNode(root: QueryBuilderGroup, nodeId: string): QueryBuilderGroup {
  return {
    ...root,
    children: root.children
      .filter((child) => child.id !== nodeId)
      .map((child) => (child.kind === "group" ? removeNode(child, nodeId) : child)),
  };
}

function validateBuiltIn(
  root: QueryBuilderGroup,
  fields: readonly QueryBuilderField[],
  messages: QueryBuilderMessages,
): readonly string[] {
  const fieldMap = new Map(fields.map((field) => [field.id, field]));
  const errors: string[] = [];
  const visit = (node: QueryBuilderNode) => {
    if (node.kind === "group") {
      node.children.forEach(visit);
      return;
    }
    const field = fieldMap.get(node.field);
    const operator = field?.operators.find((item) => item.id === node.operator);
    if (field === undefined) errors.push(messages.invalidField(node.id));
    if (operator === undefined) errors.push(messages.invalidOperator(node.id));
    if (operator?.requiresValue !== false && node.value.trim() === "") {
      errors.push(messages.missingValue(node.id));
    }
  };
  visit(root);
  return errors;
}

export function QueryBuilder({
  label,
  fields,
  value: controlledValue,
  defaultValue: defaultValueProp,
  onValueChange,
  name,
  disabled = false,
  readOnly = false,
  maximumDepth = 4,
  validate,
  showSummary = false,
  renderSummary,
  messages: messageOverrides,
  className,
  onReset,
  ...props
}: QueryBuilderProps): ReactElement {
  const defaultValue = defaultValueProp ?? createEmptyQueryGroup();
  if (
    fields.length === 0 ||
    fields.some(
      (field) =>
        field.id.length === 0 ||
        field.operators.length === 0 ||
        field.operators.some((operator) => operator.id.length === 0) ||
        new Set(field.operators.map((operator) => operator.id)).size !== field.operators.length,
    ) ||
    new Set(fields.map((field) => field.id)).size !== fields.length
  ) {
    throw new Error("Mergora QueryBuilder requires unique fields with unique operators.");
  }
  if (controlledValue !== undefined && defaultValueProp !== undefined) {
    throw new Error("Mergora QueryBuilder controlled value cannot be combined with defaultValue.");
  }
  if (!Number.isInteger(maximumDepth) || maximumDepth < 0 || maximumDepth > 20) {
    throw new Error("Mergora QueryBuilder maximumDepth must be an integer from 0 through 20.");
  }
  const messages = useMemo(() => ({ ...defaultMessages, ...messageOverrides }), [messageOverrides]);
  const reactId = useId().replaceAll(":", "");
  const nextId = useRef(0);
  const [internalValue, setInternalValue] = useState(defaultValue);
  const value = controlledValue ?? internalValue;
  const nodeIds = collectQueryNodeIds(value);
  if (new Set(nodeIds).size !== nodeIds.length) {
    throw new Error("Mergora QueryBuilder node IDs must be unique.");
  }
  const errors = useMemo(
    () => [...validateBuiltIn(value, fields, messages), ...(validate?.(value) ?? [])],
    [fields, messages, validate, value],
  );
  const errorByCondition = useMemo(
    () => new Set(errors.flatMap((error) => error.match(/Condition ([^ ]+)/u)?.[1] ?? [])),
    [errors],
  );
  const createId = (kind: "condition" | "group") =>
    `${reactId}-${kind}-${String(++nextId.current)}`;
  const commit = (next: QueryBuilderGroup, reason: QueryBuilderChangeReason, nodeId: string) => {
    if (controlledValue === undefined) setInternalValue(next);
    onValueChange?.(next, { reason, nodeId });
  };
  const firstField = fields[0]!;
  const addCondition = (groupId: string) => {
    const id = createId("condition");
    const next = replaceGroup(value, groupId, (group) => ({
      ...group,
      children: [
        ...group.children,
        {
          id,
          kind: "condition",
          field: firstField.id,
          operator: firstField.operators[0]?.id ?? "",
          value: "",
        },
      ],
    }));
    commit(next, "add-condition", id);
  };
  const addGroup = (groupId: string) => {
    const id = createId("group");
    const next = replaceGroup(value, groupId, (group) => ({
      ...group,
      children: [...group.children, createEmptyQueryGroup(id)],
    }));
    commit(next, "add-group", id);
  };
  const reorder = (groupId: string, index: number, offset: -1 | 1) => {
    const next = replaceGroup(value, groupId, (group) => {
      const destination = index + offset;
      if (destination < 0 || destination >= group.children.length) return group;
      const children = [...group.children];
      const [item] = children.splice(index, 1);
      children.splice(destination, 0, item!);
      return { ...group, children };
    });
    commit(next, "reorder", groupId);
  };

  const renderCondition = (
    condition: QueryBuilderCondition,
    groupId: string,
    index: number,
    count: number,
  ) => {
    const field = fields.find((item) => item.id === condition.field) ?? firstField;
    const operator = field.operators.find((item) => item.id === condition.operator);
    const invalid = errorByCondition.has(condition.id);
    const errorId = `${reactId}-${encodeURIComponent(condition.id)}-error`;
    const update = (patch: Partial<QueryBuilderCondition>) =>
      commit(
        replaceNode(value, condition.id, (node) => ({ ...node, ...patch }) as QueryBuilderNode),
        "update",
        condition.id,
      );
    return (
      <div
        key={condition.id}
        className="mrg-query-builder__condition"
        data-slot="query-builder-condition"
        data-invalid={invalid || undefined}
      >
        <label>
          <span>{messages.field}</span>
          <select
            value={condition.field}
            disabled={disabled || readOnly}
            aria-invalid={invalid || undefined}
            aria-describedby={invalid ? errorId : undefined}
            onChange={(event) => {
              const nextField = fields.find((item) => item.id === event.currentTarget.value)!;
              update({
                field: nextField.id,
                operator: nextField.operators[0]?.id ?? "",
                value: "",
              });
            }}
          >
            {fields.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>{messages.operator}</span>
          <select
            value={condition.operator}
            disabled={disabled || readOnly}
            aria-invalid={invalid || undefined}
            aria-describedby={invalid ? errorId : undefined}
            onChange={(event) => update({ operator: event.currentTarget.value })}
          >
            {field.operators.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        {operator?.requiresValue === false ? null : field.renderValue ? (
          field.renderValue({
            condition,
            disabled: disabled || readOnly,
            invalid,
            onValueChange: (next) => update({ value: next }),
          })
        ) : (
          <label>
            <span>{messages.value}</span>
            <input
              value={condition.value}
              disabled={disabled}
              readOnly={readOnly}
              aria-invalid={invalid || undefined}
              aria-describedby={invalid ? errorId : undefined}
              onChange={(event) => update({ value: event.currentTarget.value })}
            />
          </label>
        )}
        {!readOnly ? (
          <div
            className="mrg-query-builder__actions"
            role="group"
            aria-label={messages.conditionActions(index + 1)}
          >
            <button
              type="button"
              disabled={disabled || index === 0}
              onClick={() => reorder(groupId, index, -1)}
            >
              {messages.moveUp}
            </button>
            <button
              type="button"
              disabled={disabled || index === count - 1}
              onClick={() => reorder(groupId, index, 1)}
            >
              {messages.moveDown}
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={() => commit(removeNode(value, condition.id), "remove", condition.id)}
            >
              {messages.remove}
            </button>
          </div>
        ) : null}
        {invalid ? (
          <p id={errorId} className="mrg-query-builder__condition-error">
            {messages.conditionRecovery}
          </p>
        ) : null}
      </div>
    );
  };

  const renderGroup = (
    group: QueryBuilderGroup,
    depth: number,
    parentId?: string,
    index = 0,
    count = 1,
  ): ReactElement => (
    <fieldset
      key={group.id}
      className="mrg-query-builder__group"
      data-slot="query-builder-group"
      data-depth={depth}
      disabled={disabled}
    >
      <legend>{depth === 0 ? label : messages.groupLabel(index + 1)}</legend>
      <label className="mrg-query-builder__combinator">
        <span className="mrg-query-builder__visually-hidden">{messages.matchPolicy}</span>
        <select
          value={group.combinator}
          disabled={disabled || readOnly}
          onChange={(event) =>
            commit(
              replaceGroup(value, group.id, (candidate) => ({
                ...candidate,
                combinator: event.currentTarget.value as "and" | "or",
              })),
              "update",
              group.id,
            )
          }
        >
          <option value="and">{messages.and}</option>
          <option value="or">{messages.or}</option>
        </select>
      </label>
      {group.children.length === 0 ? (
        <p className="mrg-query-builder__empty">{messages.empty}</p>
      ) : null}
      <div className="mrg-query-builder__children">
        {group.children.map((child, childIndex) =>
          child.kind === "condition"
            ? renderCondition(child, group.id, childIndex, group.children.length)
            : renderGroup(child, depth + 1, group.id, childIndex, group.children.length),
        )}
      </div>
      {!readOnly ? (
        <div
          className="mrg-query-builder__group-actions"
          role="group"
          aria-label={depth === 0 ? messages.addToRoot(label) : messages.addToGroup(index + 1)}
        >
          <button type="button" onClick={() => addCondition(group.id)}>
            {messages.addCondition}
          </button>
          <button type="button" disabled={depth >= maximumDepth} onClick={() => addGroup(group.id)}>
            {messages.addGroup}
          </button>
          {parentId ? (
            <>
              <button
                type="button"
                disabled={index === 0}
                onClick={() => reorder(parentId, index, -1)}
              >
                {messages.moveUp}
              </button>
              <button
                type="button"
                disabled={index === count - 1}
                onClick={() => reorder(parentId, index, 1)}
              >
                {messages.moveDown}
              </button>
              <button
                type="button"
                onClick={() => commit(removeNode(value, group.id), "remove", group.id)}
              >
                {messages.remove}
              </button>
            </>
          ) : null}
        </div>
      ) : null}
    </fieldset>
  );

  const handleReset = (event: FormEvent<HTMLDivElement>) => {
    onReset?.(event);
    if (!event.defaultPrevented && controlledValue === undefined) {
      setInternalValue(defaultValue);
      onValueChange?.(defaultValue, { reason: "reset", nodeId: defaultValue.id });
    }
  };

  return (
    <div
      {...props}
      className={classes("mrg-query-builder", className)}
      data-slot="query-builder"
      data-read-only={readOnly || undefined}
      role="region"
      aria-label={label}
      aria-disabled={disabled || undefined}
      onReset={handleReset}
    >
      {renderGroup(value, 0)}
      {name ? (
        <input type="hidden" name={name} value={serializeQuery(value)} disabled={disabled} />
      ) : null}
      {errors.length > 0 ? (
        <div className="mrg-query-builder__errors" role="alert" data-slot="query-builder-errors">
          <strong>{messages.errors}</strong>
          <ul>
            {errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {showSummary ? (
        <output className="mrg-query-builder__summary" data-slot="query-builder-summary">
          <strong>{messages.summary}</strong>
          <span>{renderSummary?.(value) ?? formatQuerySummary(value, fields, messages)}</span>
        </output>
      ) : null}
    </div>
  );
}
