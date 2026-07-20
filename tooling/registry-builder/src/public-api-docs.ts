import ts from "typescript";

export type PublicApiRuntimeBoundary = "client-island" | "client-only" | "server-compatible";

export interface PublicApiSource {
  readonly id: string;
  readonly publicExports: readonly string[];
  readonly normalizedFiles: readonly {
    readonly content: string;
    readonly mediaType: "text/css" | "text/typescript" | "text/typescript-jsx";
    readonly sourcePath: string;
  }[];
}

export interface PublicApiProp {
  readonly controlledPair: string | null;
  readonly defaultStatus: "declared-runtime-default" | "implicit-undefined" | "required";
  readonly defaultValue: string | null;
  readonly description: string | null;
  readonly localizationBehavior:
    "locale-or-copy-sensitive" | "no-localization-signal" | "review-required";
  readonly name: string;
  readonly owner: string;
  readonly readonly: boolean;
  readonly required: boolean;
  readonly runtimeBoundary: PublicApiRuntimeBoundary;
  readonly semanticContract: "affects-semantics" | "no-semantic-signal" | "review-required";
  readonly sourcePath: string;
  readonly type: string;
}

export interface PublicApiPropGroup {
  readonly declarationKind: "interface" | "type";
  readonly heritage: readonly string[];
  readonly name: string;
  readonly sourcePath: string;
  readonly typeParameters: readonly string[];
}

export interface PublicApiDocs {
  readonly groups: readonly PublicApiPropGroup[];
  readonly props: readonly PublicApiProp[];
  readonly summary: {
    readonly describedProps: number;
    readonly propGroups: number;
    readonly props: number;
    readonly runtimeDefaults: number;
  };
}

interface ParsedFile {
  readonly path: string;
  readonly sourceFile: ts.SourceFile;
}

type PublicApiDeclaration = ts.InterfaceDeclaration | ts.TypeAliasDeclaration;

interface DeclarationLocation {
  readonly declaration: PublicApiDeclaration;
  readonly file: ParsedFile;
}

interface ResolvedMember {
  readonly allowsDeclarationDescriptionFallback: boolean;
  readonly description: string | null;
  readonly descriptionAmbiguous: boolean;
  readonly name: string;
  readonly readonly: boolean;
  readonly required: boolean;
  readonly sourcePath: string;
  readonly type: string;
}

type ResolvedBranch = ReadonlyMap<string, ResolvedMember>;
type TypeSubstitutions = ReadonlyMap<string, string>;

interface ResolutionContext {
  readonly declarations: ReadonlyMap<string, readonly DeclarationLocation[]>;
  readonly stack: ReadonlySet<string>;
}

function normalizedText(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

function nodeName(node: ts.PropertyName | ts.BindingName): string | null {
  if (ts.isIdentifier(node) || ts.isStringLiteral(node) || ts.isNumericLiteral(node)) {
    return node.text;
  }
  return null;
}

function typeReferenceName(node: ts.TypeNode | undefined): string | null {
  if (node === undefined || !ts.isTypeReferenceNode(node)) return null;
  return ts.isIdentifier(node.typeName) ? node.typeName.text : null;
}

function descriptionFor(sourceFile: ts.SourceFile, node: ts.Node): string | null {
  const comments = ts.getLeadingCommentRanges(sourceFile.text, node.getFullStart()) ?? [];
  const candidate = [...comments]
    .reverse()
    .find(
      (comment) =>
        comment.kind === ts.SyntaxKind.MultiLineCommentTrivia &&
        sourceFile.text.slice(comment.pos, comment.pos + 3) === "/**",
    );
  if (candidate === undefined) return null;
  const body = sourceFile.text
    .slice(candidate.pos + 3, candidate.end - 2)
    .split(/\r?\n/gu)
    .map((line) => line.replace(/^\s*\*?\s?/u, ""))
    .filter((line) => !line.startsWith("@"))
    .join(" ");
  const description = normalizedText(body);
  return description.length === 0 ? null : description;
}

function defaultOwnerFromCall(node: ts.CallExpression): string | null {
  if (
    !ts.isIdentifier(node.expression) ||
    node.expression.text !== "forwardRef" ||
    node.typeArguments === undefined ||
    node.typeArguments.length < 2
  ) {
    return null;
  }
  return typeReferenceName(node.typeArguments[1]);
}

function recordBindingDefaults(
  owner: string | null,
  binding: ts.BindingName | undefined,
  sourceFile: ts.SourceFile,
  defaults: Map<string, Map<string, string>>,
): void {
  if (owner === null || binding === undefined || !ts.isObjectBindingPattern(binding)) return;
  const ownerDefaults = defaults.get(owner) ?? new Map<string, string>();
  for (const element of binding.elements) {
    if (element.dotDotDotToken !== undefined || element.initializer === undefined) continue;
    const name = nodeName(element.propertyName ?? element.name);
    if (name === null) continue;
    ownerDefaults.set(name, normalizedText(element.initializer.getText(sourceFile)));
  }
  defaults.set(owner, ownerDefaults);
}

function collectRuntimeDefaults(files: readonly ParsedFile[]): Map<string, Map<string, string>> {
  const defaults = new Map<string, Map<string, string>>();
  for (const file of files) {
    const visit = (node: ts.Node): void => {
      if (
        ts.isFunctionDeclaration(node) ||
        ts.isFunctionExpression(node) ||
        ts.isArrowFunction(node)
      ) {
        const firstParameter = node.parameters[0];
        recordBindingDefaults(
          typeReferenceName(firstParameter?.type),
          firstParameter?.name,
          file.sourceFile,
          defaults,
        );
      }
      if (ts.isCallExpression(node)) {
        const owner = defaultOwnerFromCall(node);
        const callback = node.arguments[0];
        if (
          owner !== null &&
          callback !== undefined &&
          (ts.isFunctionExpression(callback) || ts.isArrowFunction(callback))
        ) {
          recordBindingDefaults(owner, callback.parameters[0]?.name, file.sourceFile, defaults);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(file.sourceFile);
  }
  return defaults;
}

function aliasHeritage(node: ts.TypeNode, sourceFile: ts.SourceFile): readonly string[] {
  if (ts.isTypeLiteralNode(node)) return [];
  if (ts.isIntersectionTypeNode(node)) {
    return node.types
      .filter((member) => !ts.isTypeLiteralNode(member))
      .map((member) => normalizedText(member.getText(sourceFile)));
  }
  return [normalizedText(node.getText(sourceFile))];
}

function declarationKey(location: DeclarationLocation): string {
  return `${location.file.path}#${location.declaration.name.text}`;
}

function renderType(
  node: ts.TypeNode,
  sourceFile: ts.SourceFile,
  substitutions: TypeSubstitutions,
): string {
  if (substitutions.size === 0) return normalizedText(node.getText(sourceFile));

  const start = node.getStart(sourceFile);
  const source = node.getText(sourceFile);
  const replacements: { readonly end: number; readonly start: number; readonly text: string }[] =
    [];
  const visit = (candidate: ts.Node): void => {
    if (
      ts.isTypeReferenceNode(candidate) &&
      ts.isIdentifier(candidate.typeName) &&
      candidate.typeArguments === undefined
    ) {
      const replacement = substitutions.get(candidate.typeName.text);
      if (replacement !== undefined) {
        const needsParentheses = /(?:=>|\s[&|]\s)/u.test(replacement);
        replacements.push({
          end: candidate.end - start,
          start: candidate.getStart(sourceFile) - start,
          text: needsParentheses ? `(${replacement})` : replacement,
        });
        return;
      }
    }
    ts.forEachChild(candidate, visit);
  };
  visit(node);

  let rendered = source;
  for (const replacement of replacements.sort((left, right) => right.start - left.start)) {
    rendered =
      rendered.slice(0, replacement.start) + replacement.text + rendered.slice(replacement.end);
  }
  return normalizedText(rendered);
}

function memberFromSignature(
  member: ts.PropertySignature,
  file: ParsedFile,
  substitutions: TypeSubstitutions,
): ResolvedMember | null {
  const name = nodeName(member.name);
  if (name === null) return null;
  return {
    allowsDeclarationDescriptionFallback: false,
    description: descriptionFor(file.sourceFile, member),
    descriptionAmbiguous: false,
    name,
    readonly:
      member.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ReadonlyKeyword) ??
      false,
    required: member.questionToken === undefined,
    sourcePath: file.path,
    type:
      member.type === undefined
        ? "unknown"
        : renderType(member.type, file.sourceFile, substitutions),
  };
}

function memberFromIndexSignature(
  member: ts.IndexSignatureDeclaration,
  file: ParsedFile,
  substitutions: TypeSubstitutions,
): ResolvedMember | null {
  const parameter = member.parameters[0];
  if (parameter === undefined || parameter.type === undefined) return null;
  const parameterName = nodeName(parameter.name) ?? "key";
  return {
    allowsDeclarationDescriptionFallback: false,
    description: descriptionFor(file.sourceFile, member),
    descriptionAmbiguous: false,
    name: `[${parameterName}: ${renderType(parameter.type, file.sourceFile, substitutions)}]`,
    readonly:
      member.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ReadonlyKeyword) ??
      false,
    required: true,
    sourcePath: file.path,
    type:
      member.type === undefined
        ? "unknown"
        : renderType(member.type, file.sourceFile, substitutions),
  };
}

function ownBranch(
  members: ts.NodeArray<ts.TypeElement>,
  file: ParsedFile,
  substitutions: TypeSubstitutions,
): ResolvedBranch {
  const result = new Map<string, ResolvedMember>();
  for (const member of members) {
    const resolved = ts.isPropertySignature(member)
      ? memberFromSignature(member, file, substitutions)
      : ts.isIndexSignatureDeclaration(member)
        ? memberFromIndexSignature(member, file, substitutions)
        : null;
    if (resolved !== null) result.set(resolved.name, resolved);
  }
  return result;
}

function compositeType(types: readonly string[], operator: "&" | "|"): string {
  let unique = [...new Set(types)].sort((left, right) => left.localeCompare(right, "en-US"));
  if (operator === "&" && unique.includes("never")) return "never";
  if (operator === "|" && unique.length > 1) {
    unique = unique.filter((type) => type !== "never");
  }
  if (unique.length === 1) return unique[0]!;
  return unique
    .map((type) => {
      if (operator === "&" && type.includes(" | ")) return `(${type})`;
      if (operator === "|" && type.includes("=>")) return `(${type})`;
      return type;
    })
    .join(` ${operator} `);
}

function mergeIntersectionMember(left: ResolvedMember, right: ResolvedMember): ResolvedMember {
  return {
    allowsDeclarationDescriptionFallback:
      left.allowsDeclarationDescriptionFallback && right.allowsDeclarationDescriptionFallback,
    description: left.description === right.description ? left.description : null,
    descriptionAmbiguous:
      left.descriptionAmbiguous ||
      right.descriptionAmbiguous ||
      left.description !== right.description,
    name: left.name,
    readonly: left.readonly && right.readonly,
    required: left.required || right.required,
    sourcePath: [left.sourcePath, right.sourcePath].sort((a, b) => a.localeCompare(b, "en-US"))[0]!,
    type: compositeType([left.type, right.type], "&"),
  };
}

function intersectBranches(left: ResolvedBranch, right: ResolvedBranch): ResolvedBranch {
  const result = new Map(left);
  for (const [name, member] of right) {
    const existing = result.get(name);
    result.set(name, existing === undefined ? member : mergeIntersectionMember(existing, member));
  }
  return result;
}

function overlayBranch(base: ResolvedBranch, own: ResolvedBranch): ResolvedBranch {
  return new Map([...base, ...own]);
}

function branchKey(branch: ResolvedBranch): string {
  return JSON.stringify(
    [...branch.values()]
      .sort((left, right) => left.name.localeCompare(right.name, "en-US"))
      .map((member) => [
        member.name,
        member.type,
        member.required,
        member.readonly,
        member.allowsDeclarationDescriptionFallback,
        member.description,
        member.descriptionAmbiguous,
        member.sourcePath,
      ]),
  );
}

function dedupeBranches(branches: readonly ResolvedBranch[]): readonly ResolvedBranch[] {
  const unique = new Map<string, ResolvedBranch>();
  for (const branch of branches) unique.set(branchKey(branch), branch);
  return [...unique.entries()]
    .sort(([left], [right]) => left.localeCompare(right, "en-US"))
    .map(([, branch]) => branch);
}

function intersectBranchSets(
  left: readonly ResolvedBranch[],
  right: readonly ResolvedBranch[],
): readonly ResolvedBranch[] {
  return dedupeBranches(
    left.flatMap((leftBranch) =>
      right.map((rightBranch) => intersectBranches(leftBranch, rightBranch)),
    ),
  );
}

function literalPropertyNames(node: ts.TypeNode): ReadonlySet<string> | null {
  if (ts.isParenthesizedTypeNode(node)) return literalPropertyNames(node.type);
  if (ts.isUnionTypeNode(node)) {
    const names = node.types.map(literalPropertyNames);
    if (names.some((name) => name === null)) return null;
    return new Set(names.flatMap((name) => [...name!]));
  }
  if (
    ts.isLiteralTypeNode(node) &&
    (ts.isStringLiteral(node.literal) || ts.isNumericLiteral(node.literal))
  ) {
    return new Set([node.literal.text]);
  }
  return null;
}

function transformBranchMembers(
  branches: readonly ResolvedBranch[],
  transform: (member: ResolvedMember) => ResolvedMember | null,
): readonly ResolvedBranch[] {
  return dedupeBranches(
    branches.map((branch) => {
      const result = new Map<string, ResolvedMember>();
      for (const member of branch.values()) {
        const transformed = transform(member);
        if (transformed !== null) result.set(transformed.name, transformed);
      }
      return result;
    }),
  );
}

function declarationSubstitutions(
  location: DeclarationLocation,
  typeArguments: readonly ts.TypeNode[],
  argumentSourceFile: ts.SourceFile,
  parentSubstitutions: TypeSubstitutions,
): TypeSubstitutions {
  const result = new Map<string, string>();
  const parameters = location.declaration.typeParameters ?? [];
  for (const [index, parameter] of parameters.entries()) {
    const argument = typeArguments[index];
    if (argument !== undefined) {
      result.set(
        parameter.name.text,
        renderType(argument, argumentSourceFile, parentSubstitutions),
      );
    } else if (parameter.default !== undefined) {
      result.set(
        parameter.name.text,
        renderType(parameter.default, location.file.sourceFile, result),
      );
    }
  }
  return result;
}

function uniqueDeclaration(name: string, context: ResolutionContext): DeclarationLocation | null {
  const matches = context.declarations.get(name) ?? [];
  return matches.length === 1 ? matches[0]! : null;
}

function resolveReference(
  name: string,
  typeArguments: readonly ts.TypeNode[],
  argumentSourceFile: ts.SourceFile,
  parentSubstitutions: TypeSubstitutions,
  context: ResolutionContext,
): readonly ResolvedBranch[] {
  const target = uniqueDeclaration(name, context);
  if (target === null) return [new Map()];
  return resolveDeclaration(
    target,
    declarationSubstitutions(target, typeArguments, argumentSourceFile, parentSubstitutions),
    context,
  );
}

function resolveTypeReference(
  node: ts.TypeReferenceNode,
  file: ParsedFile,
  substitutions: TypeSubstitutions,
  context: ResolutionContext,
): readonly ResolvedBranch[] {
  if (!ts.isIdentifier(node.typeName)) return [new Map()];
  const name = node.typeName.text;
  const arguments_ = node.typeArguments ?? [];
  const target = arguments_[0];

  if (name === "Record" && target !== undefined && arguments_[1] !== undefined) {
    const keyType = renderType(target, file.sourceFile, substitutions);
    const valueType = renderType(arguments_[1], file.sourceFile, substitutions);
    const literalNames = literalPropertyNames(target);
    const names =
      literalNames ??
      (["number", "string", "symbol"].includes(keyType) ? new Set([`[key: ${keyType}]`]) : null);
    if (names === null) return [new Map()];
    return [
      new Map(
        [...names]
          .sort((left, right) => left.localeCompare(right, "en-US"))
          .map((memberName) => [
            memberName,
            {
              allowsDeclarationDescriptionFallback: true,
              description: null,
              descriptionAmbiguous: false,
              name: memberName,
              readonly: false,
              required: true,
              sourcePath: file.path,
              type: valueType,
            },
          ]),
      ),
    ];
  }

  if (["Omit", "Partial", "Pick", "Readonly", "Required"].includes(name) && target !== undefined) {
    const resolved = resolveTypeNode(target, file, substitutions, context);
    if (name === "Partial") {
      return transformBranchMembers(resolved, (member) => ({ ...member, required: false }));
    }
    if (name === "Required") {
      return transformBranchMembers(resolved, (member) => ({ ...member, required: true }));
    }
    if (name === "Readonly") {
      return transformBranchMembers(resolved, (member) => ({ ...member, readonly: true }));
    }

    const selectedNames = arguments_[1] === undefined ? null : literalPropertyNames(arguments_[1]);
    if (selectedNames === null) return [new Map()];
    return transformBranchMembers(resolved, (member) => {
      const selected = selectedNames.has(member.name);
      return name === "Pick" ? (selected ? member : null) : selected ? null : member;
    });
  }

  return resolveReference(name, arguments_, file.sourceFile, substitutions, context);
}

function resolveExpressionWithTypeArguments(
  node: ts.ExpressionWithTypeArguments,
  file: ParsedFile,
  substitutions: TypeSubstitutions,
  context: ResolutionContext,
): readonly ResolvedBranch[] {
  if (!ts.isIdentifier(node.expression)) return [new Map()];
  const synthetic = ts.factory.createTypeReferenceNode(node.expression.text, node.typeArguments);
  return resolveTypeReference(synthetic, file, substitutions, context);
}

function resolveTypeNode(
  node: ts.TypeNode,
  file: ParsedFile,
  substitutions: TypeSubstitutions,
  context: ResolutionContext,
): readonly ResolvedBranch[] {
  if (ts.isParenthesizedTypeNode(node)) {
    return resolveTypeNode(node.type, file, substitutions, context);
  }
  if (ts.isTypeLiteralNode(node)) return [ownBranch(node.members, file, substitutions)];
  if (ts.isTypeReferenceNode(node)) {
    return resolveTypeReference(node, file, substitutions, context);
  }
  if (ts.isIntersectionTypeNode(node)) {
    return node.types.reduce<readonly ResolvedBranch[]>(
      (branches, type) =>
        intersectBranchSets(branches, resolveTypeNode(type, file, substitutions, context)),
      [new Map()],
    );
  }
  if (ts.isUnionTypeNode(node)) {
    return dedupeBranches(
      node.types.flatMap((type) => resolveTypeNode(type, file, substitutions, context)),
    );
  }
  return [new Map()];
}

function resolveDeclaration(
  location: DeclarationLocation,
  substitutions: TypeSubstitutions,
  context: ResolutionContext,
): readonly ResolvedBranch[] {
  const key = declarationKey(location);
  if (context.stack.has(key)) return [new Map()];
  const nextContext: ResolutionContext = {
    ...context,
    stack: new Set([...context.stack, key]),
  };
  const declaration = location.declaration;
  if (ts.isTypeAliasDeclaration(declaration)) {
    return resolveTypeNode(declaration.type, location.file, substitutions, nextContext);
  }

  let branches: readonly ResolvedBranch[] = [new Map()];
  for (const heritage of declaration.heritageClauses?.flatMap((clause) => clause.types) ?? []) {
    branches = intersectBranchSets(
      branches,
      resolveExpressionWithTypeArguments(heritage, location.file, substitutions, nextContext),
    );
  }
  const own = ownBranch(declaration.members, location.file, substitutions);
  return dedupeBranches(branches.map((branch) => overlayBranch(branch, own)));
}

function collapseBranches(
  branches: readonly ResolvedBranch[],
  declarationDescription: string | null,
): readonly ResolvedMember[] {
  const names = new Set(branches.flatMap((branch) => [...branch.keys()]));
  return [...names]
    .sort((left, right) => left.localeCompare(right, "en-US"))
    .map((name) => {
      const present = branches.flatMap((branch) => {
        const member = branch.get(name);
        return member === undefined ? [] : [member];
      });
      const descriptions = new Set(present.map((member) => member.description));
      const documentedDescriptions = [...descriptions].filter(
        (description): description is string => description !== null,
      );
      const hasUndocumentedBranch = documentedDescriptions.length !== descriptions.size;
      const hasAmbiguousIntersection = present.some((member) => member.descriptionAmbiguous);
      const allowsDeclarationDescriptionFallback = present.every(
        (member) => member.allowsDeclarationDescriptionFallback,
      );
      return {
        allowsDeclarationDescriptionFallback: false,
        description: hasAmbiguousIntersection
          ? null
          : hasUndocumentedBranch
            ? documentedDescriptions.length === 0 && allowsDeclarationDescriptionFallback
              ? declarationDescription
              : null
            : documentedDescriptions
                .sort((left, right) => left.localeCompare(right, "en-US"))
                .join(" Union alternatives: "),
        descriptionAmbiguous: false,
        name,
        readonly: present.every((member) => member.readonly),
        required: present.length === branches.length && present.every((member) => member.required),
        sourcePath: present
          .map((member) => member.sourcePath)
          .sort((left, right) => left.localeCompare(right, "en-US"))[0]!,
        type: compositeType(
          present.map((member) => member.type),
          "|",
        ),
      };
    });
}

function declarationIndex(
  files: readonly ParsedFile[],
): ReadonlyMap<string, readonly DeclarationLocation[]> {
  const declarations = new Map<string, DeclarationLocation[]>();
  for (const file of files) {
    for (const statement of file.sourceFile.statements) {
      if (!ts.isInterfaceDeclaration(statement) && !ts.isTypeAliasDeclaration(statement)) continue;
      const locations = declarations.get(statement.name.text) ?? [];
      locations.push({ declaration: statement, file });
      declarations.set(statement.name.text, locations);
    }
  }
  return declarations;
}

function isDirectlyExported(declaration: PublicApiDeclaration): boolean {
  return (
    declaration.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) ??
    false
  );
}

function controlledPair(name: string, names: ReadonlySet<string>): string | null {
  if (name.startsWith("default") && name.length > "default".length) {
    const controlled = `${name[7]!.toLocaleLowerCase("en-US")}${name.slice(8)}`;
    return names.has(controlled) ? controlled : null;
  }
  const defaultName = `default${name[0]?.toLocaleUpperCase("en-US") ?? ""}${name.slice(1)}`;
  return names.has(defaultName) ? defaultName : null;
}

function localizationBehavior(
  name: string,
  type: string,
  description: string | null,
): PublicApiProp["localizationBehavior"] {
  const evidence = `${name} ${type} ${description ?? ""}`.toLocaleLowerCase("en-US");
  if (
    /(?:locale|message|label|description|text|format|currency|timezone|time-zone|intl\.)/u.test(
      evidence,
    )
  ) {
    return "locale-or-copy-sensitive";
  }
  return description === null ? "review-required" : "no-localization-signal";
}

function semanticContract(
  name: string,
  description: string | null,
): PublicApiProp["semanticContract"] {
  const semanticNames = new Set([
    "checked",
    "disabled",
    "expanded",
    "invalid",
    "label",
    "name",
    "open",
    "pending",
    "readOnly",
    "required",
    "role",
    "selected",
    "value",
  ]);
  if (name.startsWith("aria-") || semanticNames.has(name)) return "affects-semantics";
  return description === null ? "review-required" : "no-semantic-signal";
}

function propRecord(
  owner: string,
  member: ResolvedMember,
  names: ReadonlySet<string>,
  runtimeDefaults: ReadonlyMap<string, string>,
  runtimeBoundary: PublicApiRuntimeBoundary,
): PublicApiProp | null {
  const { name, required } = member;
  const runtimeDefault = runtimeDefaults.get(name);
  const { description, type } = member;
  return {
    controlledPair: controlledPair(name, names),
    defaultStatus:
      runtimeDefault !== undefined
        ? "declared-runtime-default"
        : required
          ? "required"
          : "implicit-undefined",
    defaultValue: runtimeDefault ?? (required ? null : "undefined"),
    description,
    localizationBehavior: localizationBehavior(name, type, description),
    name,
    owner,
    readonly: member.readonly,
    required,
    runtimeBoundary,
    semanticContract: semanticContract(name, description),
    sourcePath: member.sourcePath,
    type,
  };
}

export function buildPublicApiDocs(
  source: PublicApiSource,
  runtimeBoundary: PublicApiRuntimeBoundary,
): PublicApiDocs {
  const publicExports = new Set(source.publicExports);
  const files: ParsedFile[] = source.normalizedFiles
    .filter((file) => file.mediaType !== "text/css")
    .map((file) => ({
      path: file.sourcePath,
      sourceFile: ts.createSourceFile(
        file.sourcePath,
        file.content,
        ts.ScriptTarget.Latest,
        true,
        file.mediaType === "text/typescript-jsx" ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
      ),
    }))
    .sort((left, right) => left.path.localeCompare(right.path, "en-US"));
  const defaults = collectRuntimeDefaults(files);
  const declarations = declarationIndex(files);
  const context: ResolutionContext = { declarations, stack: new Set() };
  const groups: PublicApiPropGroup[] = [];
  const props: PublicApiProp[] = [];

  for (const name of [...publicExports].sort((left, right) => left.localeCompare(right, "en-US"))) {
    const matches = declarations.get(name) ?? [];
    if (matches.length !== 1) continue;
    const location = matches[0]!;
    const statement = location.declaration;
    const file = location.file;
    if (!isDirectlyExported(statement)) continue;
    const members = collapseBranches(
      resolveDeclaration(location, new Map(), context),
      descriptionFor(file.sourceFile, statement),
    );
    if (!name.endsWith("Props") && members.length === 0) continue;
    const names = new Set(members.map((member) => member.name));
    const heritage = ts.isInterfaceDeclaration(statement)
      ? (statement.heritageClauses?.flatMap((clause) =>
          clause.types.map((type) => normalizedText(type.getText(file.sourceFile))),
        ) ?? [])
      : aliasHeritage(statement.type, file.sourceFile);
    groups.push({
      declarationKind: ts.isInterfaceDeclaration(statement) ? "interface" : "type",
      heritage,
      name,
      sourcePath: file.path,
      typeParameters:
        statement.typeParameters?.map((parameter) =>
          normalizedText(parameter.getText(file.sourceFile)),
        ) ?? [],
    });
    for (const member of members) {
      const record = propRecord(
        name,
        member,
        names,
        defaults.get(name) ?? new Map(),
        runtimeBoundary,
      );
      if (record !== null) props.push(record);
    }
  }

  groups.sort((left, right) => left.name.localeCompare(right.name, "en-US"));
  props.sort(
    (left, right) =>
      left.owner.localeCompare(right.owner, "en-US") ||
      left.name.localeCompare(right.name, "en-US"),
  );
  return {
    groups,
    props,
    summary: {
      describedProps: props.filter((prop) => prop.description !== null).length,
      propGroups: groups.length,
      props: props.length,
      runtimeDefaults: props.filter((prop) => prop.defaultStatus === "declared-runtime-default")
        .length,
    },
  };
}
