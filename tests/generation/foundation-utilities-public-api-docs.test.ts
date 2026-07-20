import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildPublicApiDocs,
  type PublicApiDocs,
  type PublicApiRuntimeBoundary,
} from "../../tooling/registry-builder/src/public-api-docs.ts";

const workspaceRoot = resolve(import.meta.dirname, "../..");

const families = [
  {
    id: "client-only",
    publicExports: ["ClientOnlyProps"],
    runtimeBoundary: "client-only",
    props: [
      "ClientOnlyProps.children",
      "ClientOnlyProps.fallback",
      "ClientOnlyProps.onClientReady",
    ],
  },
  {
    id: "direction",
    publicExports: ["DirectionBoundaryProps", "DirectionProviderProps"],
    runtimeBoundary: "client-island",
    props: [
      "DirectionBoundaryProps.direction",
      "DirectionBoundaryProps.isolate",
      "DirectionProviderProps.direction",
    ],
  },
  {
    id: "focus-ring",
    publicExports: ["FocusRingProps"],
    runtimeBoundary: "server-compatible",
    props: ["FocusRingProps.contrast"],
  },
  {
    id: "layer-manager",
    publicExports: ["LayerApplicationProps", "LayerManagerProviderProps", "LayerProps"],
    runtimeBoundary: "client-island",
    props: [
      "LayerManagerProviderProps.children",
      "LayerManagerProviderProps.scrollLock",
      "LayerProps.active",
      "LayerProps.data-slot",
      "LayerProps.dismissible",
      "LayerProps.id",
      "LayerProps.manageEnvironment",
      "LayerProps.modal",
      "LayerProps.onDismiss",
    ],
  },
  {
    id: "portal",
    publicExports: ["PortalProps"],
    runtimeBoundary: "client-only",
    props: [
      "PortalProps.children",
      "PortalProps.container",
      "PortalProps.disabled",
      "PortalProps.fallback",
    ],
  },
  {
    id: "presence",
    publicExports: ["PresenceProps"],
    runtimeBoundary: "client-island",
    props: [
      "PresenceProps.children",
      "PresenceProps.exitDurationMs",
      "PresenceProps.initialEnter",
      "PresenceProps.onExitComplete",
      "PresenceProps.present",
      "PresenceProps.reducedMotion",
    ],
  },
  {
    id: "provider",
    publicExports: ["MergoraProviderProps"],
    runtimeBoundary: "client-island",
    props: [
      "MergoraProviderProps.asChild",
      "MergoraProviderProps.children",
      "MergoraProviderProps.density",
      "MergoraProviderProps.direction",
      "MergoraProviderProps.locale",
      "MergoraProviderProps.messages",
      "MergoraProviderProps.portalContainer",
      "MergoraProviderProps.reducedMotion",
      "MergoraProviderProps.timeZone",
    ],
  },
  {
    id: "slot",
    publicExports: ["SlotProps"],
    runtimeBoundary: "server-compatible",
    props: ["SlotProps.children", "SlotProps.data-slot"],
  },
  {
    id: "sr-announcer",
    publicExports: ["AnnouncerProviderProps"],
    runtimeBoundary: "client-island",
    props: [
      "AnnouncerProviderProps.assertiveIntervalMs",
      "AnnouncerProviderProps.dedupeWindowMs",
      "AnnouncerProviderProps.politeIntervalMs",
    ],
  },
  {
    id: "visually-hidden",
    publicExports: ["VisuallyHiddenProps"],
    runtimeBoundary: "server-compatible",
    props: [],
  },
] as const satisfies readonly {
  readonly id: string;
  readonly props: readonly string[];
  readonly publicExports: readonly string[];
  readonly runtimeBoundary: PublicApiRuntimeBoundary;
}[];

function docsFor(family: (typeof families)[number]): PublicApiDocs {
  const sourcePath = `registry/source/components/${family.id}/${family.id}.tsx`;
  return buildPublicApiDocs(
    {
      id: family.id,
      normalizedFiles: [
        {
          content: readFileSync(resolve(workspaceRoot, sourcePath), "utf8"),
          mediaType: "text/typescript-jsx",
          sourcePath,
        },
      ],
      publicExports: family.publicExports,
    },
    family.runtimeBoundary,
  );
}

describe("foundation utility public API descriptions", () => {
  it("describes a deterministic recursive inventory containing every curated property", () => {
    let propCount = 0;
    let describedCount = 0;

    for (const family of families) {
      const docs = docsFor(family);
      const propNames = docs.props.map((prop) => `${prop.owner}.${prop.name}`);
      expect(propNames, `${family.id} ordering`).toEqual(
        [...propNames].sort((left, right) => left.localeCompare(right, "en-US")),
      );
      expect(propNames, `${family.id} curated inventory`).toEqual(
        expect.arrayContaining([...family.props]),
      );
      expect(docs.summary.describedProps, family.id).toBe(docs.summary.props);
      propCount += docs.summary.props;
      describedCount += docs.summary.describedProps;
    }

    expect(describedCount).toBe(propCount);
    expect(propCount).toBeGreaterThanOrEqual(40);
  });

  it("uses component-specific descriptions instead of unresolved review placeholders", () => {
    for (const family of families) {
      for (const prop of docsFor(family).props) {
        const key = `${family.id}:${prop.owner}.${prop.name}`;
        expect(prop.description, key).not.toBeNull();
        expect(prop.description?.length, key).toBeGreaterThanOrEqual(28);
        expect(prop.description, key).not.toMatch(/^(?:The|This) (?:prop|property)\b/iu);
        expect(prop.localizationBehavior, key).not.toBe("review-required");
        expect(prop.semanticContract, key).not.toBe("review-required");
      }
    }
  });

  it("keeps lifecycle and environment claims aligned with the canonical contracts", () => {
    const descriptions = new Map(
      families.flatMap((family) =>
        docsFor(family).props.map(
          (prop) => [`${family.id}:${prop.owner}.${prop.name}`, prop.description] as const,
        ),
      ),
    );

    expect(descriptions.get("client-only:ClientOnlyProps.children")).toContain("mounts");
    expect(descriptions.get("layer-manager:LayerManagerProviderProps.scrollLock")).toContain(
      "environment-managed modal",
    );
    expect(descriptions.get("layer-manager:LayerProps.dismissible")).toContain("topmost");
    expect(descriptions.get("portal:PortalProps.children")).toContain("direction");
    expect(descriptions.get("presence:PresenceProps.exitDurationMs")).toContain(
      "Authoritative exit deadline",
    );
    expect(descriptions.get("presence:PresenceProps.reducedMotion")).toContain(
      "without waiting for motion",
    );
    expect(descriptions.get("provider:MergoraProviderProps.messages")).toContain("merged by key");
    expect(descriptions.get("slot:SlotProps.data-slot")).toContain("child's value");
    expect(descriptions.get("sr-announcer:AnnouncerProviderProps.dedupeWindowMs")).toContain(
      "suppressed",
    );
  });

  it("resolves local inherited aliases while retaining their declared group metadata", () => {
    const zeroPropGroups = families.flatMap((family) => {
      const docs = docsFor(family);
      return docs.groups
        .filter((group) => docs.props.every((prop) => prop.owner !== group.name))
        .map((group) => `${family.id}:${group.name}`);
    });

    expect(zeroPropGroups).toEqual([]);
    expect(
      docsFor(families[3])
        .props.filter((prop) => prop.owner === "LayerApplicationProps")
        .map((prop) => prop.name),
    ).toEqual(["asChild", "children"]);
    expect(
      docsFor(families[9])
        .props.filter((prop) => prop.owner === "VisuallyHiddenProps")
        .map((prop) => prop.name),
    ).toEqual(["as", "revealOnFocus"]);
    expect(
      docsFor(families[3]).groups.find((group) => group.name === "LayerApplicationProps"),
    ).toMatchObject({ heritage: ["SharedBoundaryProps"] });
    expect(
      docsFor(families[9]).groups.find((group) => group.name === "VisuallyHiddenProps"),
    ).toMatchObject({ declarationKind: "type" });
  });
});
