import { describe, expect, it } from "vitest";

import { buildPublicApiDocs } from "../../tooling/registry-builder/src/public-api-docs.ts";

describe("generated public API documentation", () => {
  it("extracts public prop groups, descriptions, defaults, and controlled pairs", () => {
    const docs = buildPublicApiDocs(
      {
        id: "example",
        publicExports: ["Example", "ExampleProps", "InternalProps"],
        normalizedFiles: [
          {
            content: `
              import { forwardRef, type ButtonHTMLAttributes } from "react";

              interface InternalProps { readonly secret?: string }

              export interface ExampleProps
                extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "value"> {
                /** Current controlled value. */
                readonly value?: string;
                /** Initial value for uncontrolled use. */
                readonly defaultValue?: string;
                /** Visible localized label. */
                readonly label: string;
                readonly pending?: boolean;
              }

              export const Example = forwardRef<HTMLButtonElement, ExampleProps>(function Example(
                { pending = false, ...props },
                ref,
              ) { return <button ref={ref} {...props} />; });
            `,
            mediaType: "text/typescript-jsx",
            sourcePath: "registry/source/components/example/example.tsx",
          },
        ],
      },
      "client-island",
    );

    expect(docs.groups).toEqual([
      expect.objectContaining({
        heritage: ['Omit<ButtonHTMLAttributes<HTMLButtonElement>, "value">'],
        name: "ExampleProps",
      }),
    ]);
    expect(docs.props).toHaveLength(4);
    expect(docs.props.find((prop) => prop.name === "value")).toMatchObject({
      controlledPair: "defaultValue",
      description: "Current controlled value.",
      runtimeBoundary: "client-island",
    });
    expect(docs.props.find((prop) => prop.name === "defaultValue")?.controlledPair).toBe("value");
    expect(docs.props.find((prop) => prop.name === "label")).toMatchObject({
      defaultStatus: "required",
      localizationBehavior: "locale-or-copy-sensitive",
      required: true,
    });
    expect(docs.props.find((prop) => prop.name === "pending")).toMatchObject({
      defaultStatus: "declared-runtime-default",
      defaultValue: "false",
      semanticContract: "affects-semantics",
    });
    expect(docs.summary).toMatchObject({ describedProps: 3, propGroups: 1, props: 4 });
  });

  it("records native aliases as prop groups without inventing local props", () => {
    const docs = buildPublicApiDocs(
      {
        id: "surface",
        publicExports: ["SurfaceProps"],
        normalizedFiles: [
          {
            content:
              'import type { ComponentPropsWithoutRef } from "react"; export type SurfaceProps = ComponentPropsWithoutRef<"div">;',
            mediaType: "text/typescript",
            sourcePath: "registry/source/components/surface/surface.ts",
          },
        ],
      },
      "server-compatible",
    );

    expect(docs.groups).toEqual([
      expect.objectContaining({
        declarationKind: "type",
        heritage: ['ComponentPropsWithoutRef<"div">'],
        name: "SurfaceProps",
      }),
    ]);
    expect(docs.props).toEqual([]);
  });

  it("recursively documents local bases, utilities, and exported structured models", () => {
    const normalizedFiles = [
      {
        content: `
          interface LocalBase<TValue> {
            /** Payload retained from the generic local base. */
            readonly payload: TValue;
            /** Shared value that a public declaration may refine. */
            readonly shared?: string;
          }

          interface LocalExtra {
            /** Local field selected by utility aliases. */
            readonly kept?: boolean;
            /** Local field omitted from the public component contract. */
            readonly removed: string;
          }
        `,
        mediaType: "text/typescript" as const,
        sourcePath: "registry/source/components/composite/base.ts",
      },
      {
        content: `
          import type { ButtonHTMLAttributes } from "react";

          export interface CompositeProps
            extends LocalBase<string>, Omit<LocalExtra, "removed">,
              ButtonHTMLAttributes<HTMLButtonElement> {
            /** Optional component-owned field with a runtime default. */
            readonly own?: boolean;
            /** Public refinement replaces the local base declaration. */
            readonly shared: "own";
          }

          export interface ItemModel extends LocalBase<number> {
            /** Stable item identity for consumer collections. */
            readonly id: string;
          }

          export type UtilityModel = Readonly<Partial<Pick<LocalExtra, "kept">>>;

          export type VariantModel =
            | {
                /** Discriminant shared by every supported variant. */
                readonly kind: "compact";
                /** Compact branch label with deliberately distinct guidance. */
                readonly sharedLabel: string;
                /** Value available only in the compact branch. */
                readonly compactOnly: number;
              }
            | ({
                /** Discriminant shared by every supported variant. */
                readonly kind: "expanded";
                /** Value available only in the compact branch. */
                readonly compactOnly?: never;
                /** Expanded branch label with deliberately distinct guidance. */
                sharedLabel?: string;
                /** Value available only in the expanded branch. */
                readonly expandedOnly: boolean;
              } & Pick<LocalExtra, "kept">);

          export type ScalarModel = "first" | "second";
          interface InternalModel { readonly secret: string }

          export function Composite({ own = false }: CompositeProps): boolean {
            return own;
          }
        `,
        mediaType: "text/typescript" as const,
        sourcePath: "registry/source/components/composite/composite.ts",
      },
    ];
    const source = {
      id: "composite",
      normalizedFiles,
      publicExports: [
        "Composite",
        "CompositeProps",
        "InternalModel",
        "ItemModel",
        "ScalarModel",
        "UtilityModel",
        "VariantModel",
      ],
    };

    const docs = buildPublicApiDocs(source, "server-compatible");
    const reversed = buildPublicApiDocs(
      { ...source, normalizedFiles: [...normalizedFiles].reverse() },
      "server-compatible",
    );

    expect(reversed).toEqual(docs);
    expect(docs.groups.map((group) => group.name)).toEqual([
      "CompositeProps",
      "ItemModel",
      "UtilityModel",
      "VariantModel",
    ]);
    expect(docs.props.map((prop) => `${prop.owner}.${prop.name}`)).toEqual([
      "CompositeProps.kept",
      "CompositeProps.own",
      "CompositeProps.payload",
      "CompositeProps.shared",
      "ItemModel.id",
      "ItemModel.payload",
      "ItemModel.shared",
      "UtilityModel.kept",
      "VariantModel.compactOnly",
      "VariantModel.expandedOnly",
      "VariantModel.kept",
      "VariantModel.kind",
      "VariantModel.sharedLabel",
    ]);
    expect(
      docs.props.find((prop) => prop.owner === "CompositeProps" && prop.name === "payload"),
    ).toMatchObject({
      required: true,
      sourcePath: "registry/source/components/composite/base.ts",
      type: "string",
    });
    expect(
      docs.props.find((prop) => prop.owner === "CompositeProps" && prop.name === "shared"),
    ).toMatchObject({
      description: "Public refinement replaces the local base declaration.",
      required: true,
      sourcePath: "registry/source/components/composite/composite.ts",
      type: '"own"',
    });
    expect(
      docs.props.find((prop) => prop.owner === "CompositeProps" && prop.name === "own"),
    ).toMatchObject({ defaultStatus: "declared-runtime-default", defaultValue: "false" });
    expect(
      docs.props.find((prop) => prop.owner === "ItemModel" && prop.name === "payload"),
    ).toMatchObject({ type: "number" });
    expect(
      docs.props.find((prop) => prop.owner === "UtilityModel" && prop.name === "kept"),
    ).toMatchObject({ readonly: true, required: false });
    expect(
      docs.props.find((prop) => prop.owner === "VariantModel" && prop.name === "kind"),
    ).toMatchObject({ readonly: true, required: true, type: '"compact" | "expanded"' });
    expect(
      docs.props.find((prop) => prop.owner === "VariantModel" && prop.name === "sharedLabel"),
    ).toMatchObject({
      readonly: false,
      required: false,
      semanticContract: "no-semantic-signal",
      type: "string",
    });
    expect(
      docs.props.find((prop) => prop.owner === "VariantModel" && prop.name === "sharedLabel")
        ?.description,
    ).toContain("Compact branch label");
    expect(
      docs.props.find((prop) => prop.owner === "VariantModel" && prop.name === "sharedLabel")
        ?.description,
    ).toContain("Expanded branch label");
    expect(
      docs.props.find((prop) => prop.owner === "VariantModel" && prop.name === "compactOnly"),
    ).toMatchObject({ required: false });
    expect(docs.summary).toEqual({
      describedProps: 13,
      propGroups: 4,
      props: 13,
      runtimeDefaults: 1,
    });
  });

  it("terminates local cycles and declines ambiguous or dynamic expansion", () => {
    const docs = buildPublicApiDocs(
      {
        id: "bounded-resolution",
        publicExports: ["AmbiguousProps", "CycleModel", "DynamicPickProps", "Duplicate"],
        normalizedFiles: [
          {
            content: `
              interface CycleA extends CycleB {
                /** First field preserved across a recursive local cycle. */
                readonly alpha: string;
              }
              interface CycleB extends CycleA {
                /** Second field preserved across a recursive local cycle. */
                readonly beta?: boolean;
              }
              interface Selectable {
                /** Selectable field that cannot be inferred through dynamic keys. */
                readonly selectable: string;
              }
              interface Duplicate { readonly first: string }
              export type CycleModel = CycleA;
              export type DynamicPickProps = Pick<Selectable, keyof Selectable> & {
                /** Direct field remains documented when a utility key is not literal. */
                readonly direct: number;
              };
              export interface AmbiguousProps extends Duplicate {
                /** Direct public field remains available despite an ambiguous base. */
                readonly own: boolean;
              }
            `,
            mediaType: "text/typescript",
            sourcePath: "registry/source/components/bounded/a.ts",
          },
          {
            content: "interface Duplicate { readonly second: number }",
            mediaType: "text/typescript",
            sourcePath: "registry/source/components/bounded/b.ts",
          },
        ],
      },
      "server-compatible",
    );

    expect(docs.groups.map((group) => group.name)).toEqual([
      "AmbiguousProps",
      "CycleModel",
      "DynamicPickProps",
    ]);
    expect(docs.props.map((prop) => `${prop.owner}.${prop.name}`)).toEqual([
      "AmbiguousProps.own",
      "CycleModel.alpha",
      "CycleModel.beta",
      "DynamicPickProps.direct",
    ]);
  });

  it("documents indexed interfaces and finite or dictionary Record models", () => {
    const docs = buildPublicApiDocs(
      {
        id: "indexed-models",
        publicExports: ["DictionaryModel", "FiniteRecordModel", "ReadonlyRecordModel"],
        normalizedFiles: [
          {
            content: `
              export interface DictionaryModel {
                /** Values addressed by a consumer-defined string key. */
                readonly [key: string]: boolean;
              }
              /** Numeric values addressed by a consumer-defined string key. */
              export type ReadonlyRecordModel = Readonly<Record<string, number>>;
              export type FiniteRecordModel = Record<"first" | "second", Date>;
            `,
            mediaType: "text/typescript",
            sourcePath: "registry/source/components/indexed-models/indexed-models.ts",
          },
        ],
      },
      "server-compatible",
    );

    expect(docs.groups.map((group) => group.name)).toEqual([
      "DictionaryModel",
      "FiniteRecordModel",
      "ReadonlyRecordModel",
    ]);
    expect(docs.props.map((prop) => `${prop.owner}.${prop.name}`)).toEqual([
      "DictionaryModel.[key: string]",
      "FiniteRecordModel.first",
      "FiniteRecordModel.second",
      "ReadonlyRecordModel.[key: string]",
    ]);
    expect(docs.props.find((prop) => prop.owner === "DictionaryModel")).toMatchObject({
      description: "Values addressed by a consumer-defined string key.",
      readonly: true,
      required: true,
      type: "boolean",
    });
    expect(docs.props.find((prop) => prop.owner === "ReadonlyRecordModel")).toMatchObject({
      description: "Numeric values addressed by a consumer-defined string key.",
      readonly: true,
      type: "number",
    });
  });

  it("keeps conflicting intersection documentation in explicit review", () => {
    const docs = buildPublicApiDocs(
      {
        id: "intersection-review",
        publicExports: ["IntersectionModel"],
        normalizedFiles: [
          {
            content: `
              interface FirstContract {
                /** First contract gives the collision one meaning. */
                readonly collision: string;
              }
              interface SecondContract {
                /** Second contract gives the collision another meaning. */
                readonly collision: string;
              }
              /** Overall model prose must not hide member-level disagreement. */
              export type IntersectionModel = FirstContract & SecondContract;
            `,
            mediaType: "text/typescript",
            sourcePath: "registry/source/components/intersection-review/intersection-review.ts",
          },
        ],
      },
      "server-compatible",
    );

    expect(docs.props).toEqual([
      expect.objectContaining({
        description: null,
        name: "collision",
        owner: "IntersectionModel",
        semanticContract: "review-required",
      }),
    ]);
  });

  it("does not apply declaration prose to ordinary direct, inherited, union, or index rows", () => {
    const docs = buildPublicApiDocs(
      {
        id: "strict-member-docs",
        publicExports: ["ComposedProps", "DirectProps", "UndocumentedIndexModel"],
        normalizedFiles: [
          {
            content: `
              interface LocalBase {
                readonly inherited?: boolean;
              }
              type LocalVariant =
                | { readonly kind: "first"; readonly branchValue?: number }
                | { readonly kind: "second"; readonly branchValue?: number };

              /** Overall direct component contract, not member documentation. */
              export interface DirectProps {
                readonly undocumented?: string;
              }

              /** Overall composed contract, not inherited or union member documentation. */
              export type ComposedProps = LocalBase & LocalVariant;

              /** Overall explicit dictionary contract, not index member documentation. */
              export interface UndocumentedIndexModel {
                readonly [key: string]: unknown;
              }
            `,
            mediaType: "text/typescript",
            sourcePath: "registry/source/components/strict-member-docs/strict-member-docs.ts",
          },
        ],
      },
      "server-compatible",
    );

    expect(docs.props.map((prop) => `${prop.owner}.${prop.name}`)).toEqual([
      "ComposedProps.branchValue",
      "ComposedProps.inherited",
      "ComposedProps.kind",
      "DirectProps.undocumented",
      "UndocumentedIndexModel.[key: string]",
    ]);
    for (const prop of docs.props) {
      expect(prop.description, `${prop.owner}.${prop.name}`).toBeNull();
      expect(prop.localizationBehavior, `${prop.owner}.${prop.name}`).toBe("review-required");
      expect(prop.semanticContract, `${prop.owner}.${prop.name}`).toBe("review-required");
    }
  });
});
