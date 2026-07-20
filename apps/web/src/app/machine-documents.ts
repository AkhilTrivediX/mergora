import { createHash } from "node:crypto";

import apiIndex from "../../../../content/generated/api-index.json";
import docsIndex from "../../../../content/generated/docs-index.json";
import catalogNavigation from "../../../../content/generated/navigation.json";
import catalog from "../../../../registry/generated/catalog.json";
import documentationContractIndex from "../../../../registry/generated/documentation-contract-index.v1.json";
import implementationMatrix from "../../../../registry/generated/implementation-matrix.v1.json";
import passportSkeletons from "../../../../registry/generated/passport-skeletons.json";
import {
  documentationPageNeighbors,
  documentationPages,
  documentationSectionId,
  findDocumentationPage,
  footerDocumentationNavigation,
  globalDocumentationNavigation,
} from "./docs/docs-content";
import { absoluteSiteUrl } from "./site-origin";
import {
  buildStateLabModel,
  buildStateLabSearch,
  defaultStateLabConfiguration,
  type DocumentationContractItem as StateLabDocumentationContractItem,
} from "./state-lab-model";

export const MACHINE_SCHEMA_VERSION = 1;
export const CONTENT_VERSION = "unreleased";
export const SOURCE_COMMIT =
  process.env.MERGORA_SOURCE_COMMIT ?? process.env.GITHUB_SHA ?? "unreleased";
export const REVIEW_NOTICE =
  "Generated code must still be reviewed and tested in the consumer's context.";

export const PASSPORT_EVIDENCE_VOCABULARY = [
  {
    state: "Pass",
    meaning: "Current, release-bound evidence satisfies the applicable requirement.",
  },
  {
    state: "Pass with limitation",
    meaning: "Current evidence is conditional on a documented, owned limitation.",
  },
  { state: "Fail", meaning: "Current evidence demonstrates that the requirement is not met." },
  {
    state: "Not tested",
    meaning: "Applicable release-bound evidence has not been supplied.",
  },
  {
    state: "Not applicable",
    meaning: "The requirement does not apply, with a recorded rationale.",
  },
  { state: "Expired", meaning: "Evidence exists but is outside its approved review window." },
] as const;

export const PASSPORT_SECTION_DEFINITIONS = [
  { id: "contract", title: "Contract" },
  { id: "automation", title: "Automation" },
  { id: "manual-assistive-technology", title: "Manual assistive technology" },
  { id: "keyboard-and-focus", title: "Keyboard and focus" },
  { id: "responsive-and-input", title: "Responsive and input" },
  { id: "locale-and-direction", title: "Locale and direction" },
  { id: "visual-modes", title: "Visual modes" },
  { id: "compatibility", title: "Compatibility" },
  { id: "footprint-and-dependencies", title: "Footprint and dependencies" },
  { id: "semantic-sync", title: "Semantic Sync" },
  { id: "known-limitations", title: "Known limitations" },
] as const;

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right, "en-US"))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

export function contentDigest(value: unknown): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(canonicalJson(value)).digest("hex")}`;
}

function withDigest<T extends Record<string, unknown>>(
  value: T,
): T & { readonly generatedDigest: `sha256:${string}` } {
  return { ...value, generatedDigest: contentDigest(value) };
}

interface PassportSkeleton {
  readonly claim: string;
  readonly implementationStatus: string;
  readonly itemId: string;
  readonly knownLimitationsStatus: string;
  readonly manualEvidenceStatus: string;
  readonly missingInputs: readonly string[];
  readonly overall: {
    readonly aggregateState: string;
    readonly explanation: string;
    readonly state: string;
  };
  readonly passportId: string;
  readonly publishable: boolean;
  readonly requiredEvidence: readonly {
    readonly aggregateState: string;
    readonly family: string;
    readonly references: readonly unknown[];
    readonly state: string;
  }[];
  readonly requiredStates: readonly string[];
  readonly riskClass: number;
  readonly skeleton: boolean;
}

interface DocumentationContractItem {
  readonly anatomy: {
    readonly document: unknown;
    readonly sourceKind: string;
    readonly sourcePath: string | null;
    readonly status: string;
  };
  readonly displayName: string;
  readonly family: string;
  readonly id: string;
  readonly implementationStatus: string;
  readonly layer: string;
  readonly stateApplicability: {
    readonly reason: string | null;
    readonly sourcePath: string | null;
    readonly states: readonly {
      readonly applicability: string;
      readonly id: string;
      readonly rationale: string | null;
      readonly story: {
        readonly exportName: string;
        readonly modulePath: string;
        readonly status: string;
      } | null;
    }[];
    readonly status: string;
  };
  readonly storybook: {
    readonly basic: {
      readonly exportName: string;
      readonly matrixStatus?: string | null;
      readonly mode?: string | null;
      readonly modulePath: string;
      readonly status: string;
    };
    readonly recommended: {
      readonly exportName: string;
      readonly matrixStatus?: string | null;
      readonly mode?: string | null;
      readonly modulePath: string;
      readonly status: string;
    };
  };
  readonly semanticInteractionContract: {
    readonly claim: string | null;
    readonly contractVersion: string | null;
    readonly document: unknown;
    readonly reason?: string | null;
    readonly recordedEvidence: readonly unknown[];
    readonly semantics: unknown;
    readonly sourcePath: string | null;
    readonly sourceStatus: string;
    readonly status: string;
  };
}

type PassportSectionId = (typeof PASSPORT_SECTION_DEFINITIONS)[number]["id"];

const PASSPORT_FAMILY_MAP: Readonly<Record<PassportSectionId, readonly string[]>> = {
  automation: [
    "axe",
    "browser-aria",
    "quality-passport",
    "role-name-query",
    "schema-and-types",
    "unit-state",
    "workflow-e2e",
  ],
  compatibility: ["package-source-parity", "packed-consumer"],
  contract: ["schema-and-types", "role-name-query"],
  "footprint-and-dependencies": ["performance-scale"],
  "keyboard-and-focus": ["keyboard-interaction"],
  "known-limitations": [],
  "locale-and-direction": ["locale-direction"],
  "manual-assistive-technology": ["manual-desktop-at", "manual-mobile-at", "speech", "switch"],
  "responsive-and-input": ["responsive-reflow"],
  "semantic-sync": ["semantic-sync"],
  "visual-modes": ["visual-modes"],
};

function recordValue(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringValues(value: unknown): readonly string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function nestedRecord(value: unknown, key: string): Record<string, unknown> | null {
  return recordValue(recordValue(value)?.[key]);
}

function humanizeIdentifier(value: string): string {
  return value.replaceAll("-", " ");
}

function summarizeRecord(value: unknown): readonly string[] {
  const record = recordValue(value);
  if (record === null) return [];
  return Object.entries(record).map(([key, child]) => {
    const rendered = Array.isArray(child)
      ? child.map(String).join(", ")
      : typeof child === "object" && child !== null
        ? JSON.stringify(child)
        : String(child);
    return `${humanizeIdentifier(key)}: ${rendered}`;
  });
}

function repositoryFileUrl(path: string, commit: string | null): string {
  const revision = commit ?? "main";
  const encodedPath = path
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
  return `https://github.com/AkhilTrivediX/mergora/blob/${revision}/${encodedPath}`;
}

function currentSourceCommit(): string | null {
  return /^[0-9a-f]{40}$/u.test(SOURCE_COMMIT) ? SOURCE_COMMIT : null;
}

function absoluteNavigationLink(link: { readonly label: string; readonly route: string }) {
  return {
    label: link.label,
    url: link.route.startsWith("https://") ? link.route : absoluteSiteUrl(link.route),
  } as const;
}

function catalogSequence() {
  return catalogNavigation.groups.map((group) => ({
    id: group.id,
    items: group.items.map((item, index) => ({
      id: item.id,
      title: item.title,
      url: absoluteSiteUrl(item.route),
      previous:
        index === 0
          ? null
          : {
              id: group.items[index - 1]?.id ?? "",
              url: absoluteSiteUrl(group.items[index - 1]?.route ?? item.route),
            },
      next:
        index === group.items.length - 1
          ? null
          : {
              id: group.items[index + 1]?.id ?? "",
              url: absoluteSiteUrl(group.items[index + 1]?.route ?? item.route),
            },
    })),
  }));
}

export function documentationNavigationDocument() {
  const base = {
    schemaVersion: MACHINE_SCHEMA_VERSION,
    kind: "documentation-navigation",
    canonicalUrl: absoluteSiteUrl("/m/v1/documentation-navigation.json"),
    contentVersion: CONTENT_VERSION,
    sourceCommit: SOURCE_COMMIT,
    publicationStatus: "blocked-unreleased",
    catalogAuthority: absoluteSiteUrl("/m/v1/navigation.json"),
    global: globalDocumentationNavigation.map(absoluteNavigationLink),
    documentation: documentationPages.map((page, index) => ({
      id: page.slug,
      title: page.title,
      url: absoluteSiteUrl(`/docs/${page.slug}`),
      previous:
        index === 0
          ? null
          : {
              id: documentationPages[index - 1]?.slug ?? "",
              url: absoluteSiteUrl(`/docs/${documentationPages[index - 1]?.slug ?? page.slug}`),
            },
      next:
        index === documentationPages.length - 1
          ? null
          : {
              id: documentationPages[index + 1]?.slug ?? "",
              url: absoluteSiteUrl(`/docs/${documentationPages[index + 1]?.slug ?? page.slug}`),
            },
    })),
    footer: footerDocumentationNavigation.map(absoluteNavigationLink),
    catalogSequences: catalogSequence(),
    reviewNotice: REVIEW_NOTICE,
  } as const;
  return withDigest(base);
}

function documentationContractFor(id: string): DocumentationContractItem | null {
  return (
    (documentationContractIndex.items as readonly unknown[])
      .map((entry) => entry as DocumentationContractItem)
      .find((candidate) => candidate.id === id) ?? null
  );
}

function stateLabLinks(contract: DocumentationContractItem, route: string) {
  const model = buildStateLabModel(contract as StateLabDocumentationContractItem);
  const defaults = defaultStateLabConfiguration();
  const link = (story: "basic" | "recommended" | "state", stateId: string | null = null) => {
    const search = buildStateLabSearch(model, {
      ...defaults,
      stateId,
      story,
    });
    return absoluteSiteUrl(`${route}${search}#state-lab`);
  };
  return {
    stateLab: absoluteSiteUrl(`${route}#state-lab`),
    basic: {
      availability: model.basic.availability,
      evidenceStatus: model.basic.evidenceStatus,
      sourcePointer: model.basic.pointer,
      unavailableReason: model.basic.unavailableReason,
      url: link("basic"),
    },
    recommended: {
      availability: model.recommended.availability,
      evidenceStatus: model.recommended.evidenceStatus,
      sourcePointer: model.recommended.pointer,
      unavailableReason: model.recommended.unavailableReason,
      url: link("recommended"),
    },
    states: model.states.map((state) => ({
      id: state.id,
      applicability: state.applicability,
      rationale: state.rationale,
      availability: state.story?.availability ?? "not-applicable",
      evidenceStatus: state.story?.evidenceStatus ?? "not-applicable",
      sourcePointer: state.story?.pointer ?? null,
      unavailableReason:
        state.story?.unavailableReason ??
        (state.applicability === "not-applicable"
          ? (state.rationale ?? "The source contract records this state as not applicable.")
          : "No validated source story is recorded."),
      url: state.story === null ? null : link("state", state.id),
    })),
  } as const;
}

function contractEvidenceRequirements(document: Record<string, unknown> | null) {
  const requirements = nestedRecord(document, "evidenceRequirements");
  return {
    automated: stringValues(requirements?.automated),
    manual: stringValues(requirements?.manual),
  } as const;
}

function keyboardContract(document: Record<string, unknown> | null, semantics: readonly string[]) {
  const interaction = recordValue(document?.interaction);
  return {
    interaction,
    semanticStatements: semantics.filter((statement) =>
      /keyboard|focus|arrow|enter|space|escape|tab|home|end|pageup|pagedown/iu.test(statement),
    ),
  } as const;
}

function passportVerificationCommand(machineUrl: string): string {
  return `node -e "const c=require('node:crypto');const sort=v=>Array.isArray(v)?v.map(sort):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b,'en-US')).map(([k,x])=>[k,sort(x)])):v;fetch(process.argv[1]).then(r=>{if(!r.ok)throw new Error('HTTP '+r.status);return r.json()}).then(d=>{const expected=d.generatedDigest;delete d.generatedDigest;const actual='sha256:'+c.createHash('sha256').update(JSON.stringify(sort(d))).digest('hex');if(actual!==expected){console.error('Digest mismatch',actual,expected);process.exit(1)}console.log(actual)})" ${machineUrl}`;
}

function sectionDetails(
  sectionId: PassportSectionId,
  contract: DocumentationContractItem,
  skeleton: PassportSkeleton,
  matrix: (typeof implementationMatrix.items)[number],
): readonly string[] {
  const document = recordValue(contract.semanticInteractionContract.document);
  const requirements = nestedRecord(document, "evidenceRequirements");
  const interaction = nestedRecord(document, "interaction");
  const limitations = stringValues(document?.limitations);
  const requiredFamilies = skeleton.requiredEvidence
    .map(({ family }) => family)
    .filter((family) => PASSPORT_FAMILY_MAP[sectionId].includes(family));
  const families =
    requiredFamilies.length === 0
      ? ["No item-specific release evidence family is declared in this section."]
      : [`Required release evidence: ${requiredFamilies.join(", ")}.`];

  switch (sectionId) {
    case "contract":
      return [
        `Source contract status: ${humanizeIdentifier(contract.semanticInteractionContract.status)}.`,
        contract.semanticInteractionContract.contractVersion === null
          ? "Authoritative contract version: not supplied."
          : `Declared contract version: ${contract.semanticInteractionContract.contractVersion}.`,
        contract.semanticInteractionContract.claim ??
          contract.semanticInteractionContract.reason ??
          "No authoritative contract claim is supplied.",
      ];
    case "automation": {
      const declared = stringValues(requirements?.automated);
      return [
        ...families,
        declared.length === 0
          ? "Source contract automation requirements are not supplied."
          : `Source contract requests: ${declared.join(", ")}.`,
        `${String(contract.semanticInteractionContract.recordedEvidence.length)} release-bound records are present in the documentation contract index.`,
      ];
    }
    case "manual-assistive-technology": {
      const declared = stringValues(requirements?.manual);
      return [
        `Skeleton status: ${humanizeIdentifier(skeleton.manualEvidenceStatus)}.`,
        ...families,
        declared.length === 0
          ? "Source contract manual scenarios are not supplied."
          : `Source contract requests: ${declared.join(", ")}.`,
      ];
    }
    case "keyboard-and-focus":
      return [
        ...families,
        ...summarizeRecord(interaction).filter((entry) => /keyboard|switch|speech/u.test(entry)),
        "No release-bound action-map or focus-restoration record is supplied.",
      ];
    case "responsive-and-input":
      return [
        ...families,
        ...summarizeRecord(document?.responsive),
        "No release-bound 320px, zoom/reflow, touch, coarse-pointer, or virtual-keyboard record is supplied.",
      ];
    case "locale-and-direction":
      return [
        ...families,
        ...summarizeRecord(document?.internationalization),
        "No release-bound locale, RTL, pseudo-expansion, formatting, or time-zone record is supplied.",
      ];
    case "visual-modes":
      return [
        ...families,
        ...summarizeRecord(document?.preferences),
        "No release-bound light, dark, enhanced-contrast, forced-colors, or reduced-motion record is supplied.",
      ];
    case "compatibility":
      return [
        ...families,
        `Repository matrix context is ${humanizeIdentifier(matrix.packageSourceShadcnParity.assessment.status)}; it is not a release-bound Passport record.`,
        "No exact released React, framework, browser, Node, TypeScript, Tailwind, or package-manager matrix is supplied.",
      ];
    case "footprint-and-dependencies":
      return [
        ...families,
        "No release-bound JS, CSS, or source measurement is supplied.",
        "No released dependency, license, or security snapshot is supplied.",
      ];
    case "semantic-sync":
      return [
        ...families,
        "No release-bound clean install, update, non-overlap merge, conflict isolation, or rollback record is supplied.",
      ];
    case "known-limitations":
      return [
        `Assessment status: ${humanizeIdentifier(skeleton.knownLimitationsStatus)}.`,
        limitations.length === 0
          ? "The source contract supplies no reviewed item-specific limitation declarations."
          : `${String(limitations.length)} source-contract limitation declaration${limitations.length === 1 ? " is" : "s are"} shown below, without release review.`,
      ];
  }
}

export function passportMachineDocument(id: string) {
  const contract = (documentationContractIndex.items as readonly unknown[])
    .map((entry) => entry as DocumentationContractItem)
    .find((candidate) => candidate.id === id);
  const skeleton = (passportSkeletons.items as readonly unknown[])
    .map((entry) => entry as PassportSkeleton)
    .find((candidate) => candidate.itemId === id);
  const catalogItem = catalog.items.find((candidate) => candidate.id === id);
  const matrix = implementationMatrix.items.find((candidate) => candidate.id === id);
  if (
    contract === undefined ||
    skeleton === undefined ||
    catalogItem === undefined ||
    matrix === undefined
  ) {
    return null;
  }

  const sourceCommit = currentSourceCommit();
  const sourcePath = matrix.packageSourceShadcnParity.artifacts.canonicalSource;
  const contractPath = contract.semanticInteractionContract.sourcePath;
  const machineJsonUrl = absoluteSiteUrl(`/m/v1/passports/${id}.json`);
  const contractDocument = recordValue(contract.semanticInteractionContract.document);
  const declaredLimitations = stringValues(contractDocument?.limitations);
  const contractContext =
    contractPath === null
      ? []
      : [
          {
            kind: "source-contract-not-release-evidence",
            label:
              contract.semanticInteractionContract.status === "draft-unavailable"
                ? "Draft contract source (not authoritative)"
                : "Source contract (not release evidence)",
            url: repositoryFileUrl(contractPath, sourceCommit),
          },
        ];
  const sourceContext = {
    kind: "canonical-source-not-release-evidence",
    label: "Canonical source (not release evidence)",
    url: repositoryFileUrl(sourcePath, sourceCommit),
  } as const;
  const sections = PASSPORT_SECTION_DEFINITIONS.map(({ id: sectionId, title }) => ({
    id: sectionId,
    title,
    rows: [
      {
        id: `${sectionId}-release-evidence`,
        state: "Not tested" as const,
        aggregateState: "Unknown" as const,
        summary:
          sectionId === "known-limitations"
            ? "Known limitations have not been assessed for a release."
            : "Applicable release-bound evidence has not been supplied.",
        details: sectionDetails(sectionId, contract, skeleton, matrix),
        evidenceReferences: [] as const,
        contextReferences:
          sectionId === "contract"
            ? [...contractContext, sourceContext]
            : sectionId === "known-limitations" || sectionId === "automation"
              ? contractContext
              : [],
        missingEvidenceExplanation:
          "The generated skeleton contains no release-bound evidence reference. Repository source and tests are context only and do not upgrade this result.",
      },
    ],
  }));
  const base = {
    schemaVersion: MACHINE_SCHEMA_VERSION,
    artifactKind: "quality-passport-skeleton-document",
    documentProfile: "blocked-unreleased-preview-v1",
    id,
    passportId: skeleton.passportId,
    displayName: contract.displayName,
    family: contract.family,
    layer: contract.layer,
    canonicalUrl: absoluteSiteUrl(`/quality/${id}`),
    contentVersion: CONTENT_VERSION,
    publicationStatus: "blocked-unreleased",
    publishable: false,
    skeleton: true,
    item: {
      implementationStatus: skeleton.implementationStatus,
      targetMaturity: catalogItem.targetMaturity,
      publishedMaturity: catalogItem.publishedMaturity,
      trust: catalogItem.trust,
      riskClass: skeleton.riskClass,
      itemVersion: null,
      uiVersion: null,
    },
    releaseIdentity: {
      release: null,
      sourceCommit,
      sourceDigest: null,
      evidenceDigest: null,
      evidenceGeneratedAt: null,
    },
    manualReview: {
      status: "not-yet-verified",
      lastReviewed: null,
      nextReviewAt: null,
    },
    overall: {
      releaseGateResult: "Blocked",
      evidenceState: "Not tested",
      aggregateState: "Blocked",
      explanation: skeleton.overall.explanation,
    },
    claimScope: skeleton.claim,
    missingInputs: skeleton.missingInputs,
    requiredStates: skeleton.requiredStates,
    blockers: matrix.remainingBlockers,
    evidenceVocabulary: PASSPORT_EVIDENCE_VOCABULARY,
    sections,
    limitations: {
      assessmentStatus: skeleton.knownLimitationsStatus,
      declarations: declaredLimitations.map((summary, index) => ({
        id: `${id}-source-limitation-${String(index + 1)}`,
        state: "Not tested" as const,
        reviewStatus: "not-reviewed",
        summary,
      })),
    },
    links: {
      machineJson: machineJsonUrl,
      immutableJson: null,
      contract:
        contractPath === null
          ? null
          : {
              status: contract.semanticInteractionContract.status,
              url: repositoryFileUrl(contractPath, sourceCommit),
            },
      source: {
        path: sourcePath,
        url: repositoryFileUrl(sourcePath, sourceCommit),
      },
      issues: `https://github.com/AkhilTrivediX/mergora/issues?q=${encodeURIComponent(`is:issue ${id}`)}`,
    },
    verification: {
      scope:
        "Current JSON document bytes after canonicalization; this is not a release evidence digest.",
      command: passportVerificationCommand(machineJsonUrl),
    },
    reviewNotice: REVIEW_NOTICE,
  } as const;
  return withDigest(base);
}

export function docsMachineDocument(slug: string) {
  const page = findDocumentationPage(slug);
  if (page === undefined) return null;
  const neighbors = documentationPageNeighbors(slug);
  const base = {
    schemaVersion: MACHINE_SCHEMA_VERSION,
    kind: "docs-page",
    id: page.slug,
    title: page.title,
    summary: page.description,
    canonicalUrl: absoluteSiteUrl(`/docs/${page.slug}`),
    immutableVersionUrl: null,
    contentVersion: CONTENT_VERSION,
    sourceCommit: SOURCE_COMMIT,
    publicationStatus: "blocked-unreleased",
    sections: page.sections.map((section) => ({
      id: documentationSectionId(section.heading),
      heading: section.heading,
      paragraphs: section.paragraphs,
      command: section.code ?? null,
    })),
    navigation: {
      global: globalDocumentationNavigation.map(absoluteNavigationLink),
      documentation: absoluteSiteUrl("/m/v1/documentation-navigation.json"),
      previous:
        neighbors.previous === null
          ? null
          : {
              id: neighbors.previous.slug,
              title: neighbors.previous.title,
              url: absoluteSiteUrl(`/docs/${neighbors.previous.slug}`),
            },
      next:
        neighbors.next === null
          ? null
          : {
              id: neighbors.next.slug,
              title: neighbors.next.title,
              url: absoluteSiteUrl(`/docs/${neighbors.next.slug}`),
            },
      footer: footerDocumentationNavigation.map(absoluteNavigationLink),
    },
    related: {
      documentationIndex: absoluteSiteUrl("/docs"),
      quality: absoluteSiteUrl("/quality"),
      machineJson: absoluteSiteUrl(`/m/v1/docs/${page.slug}.json`),
      machineMarkdown: absoluteSiteUrl(`/m/v1/docs/${page.slug}.md`),
    },
    reviewNotice: REVIEW_NOTICE,
  } as const;
  return withDigest(base);
}

export function docsMachineMarkdown(slug: string): string | null {
  const document = docsMachineDocument(slug);
  if (document === null) return null;
  return [
    `# ${document.title}`,
    "",
    document.summary,
    "",
    `Status: ${document.publicationStatus}`,
    `Canonical: ${document.canonicalUrl}`,
    `Content version: ${document.contentVersion}`,
    `Source commit: ${document.sourceCommit}`,
    `Digest: ${document.generatedDigest}`,
    `Previous: ${document.navigation.previous?.url ?? "none"}`,
    `Next: ${document.navigation.next?.url ?? "none"}`,
    "",
    ...document.sections.flatMap((section) => [
      `## ${section.heading}`,
      "",
      ...section.paragraphs,
      ...(section.command === null ? [] : ["", "```sh", section.command, "```"]),
      "",
    ]),
    "## Machine resources",
    "",
    `- JSON: ${document.related.machineJson}`,
    `- Markdown: ${document.related.machineMarkdown}`,
    `- Navigation: ${document.navigation.documentation}`,
    "",
    `> ${document.reviewNotice}`,
    "",
  ].join("\n");
}

export function itemMachineDocument(id: string) {
  const item = docsIndex.items.find((candidate) => candidate.id === id);
  const catalogItem = catalog.items.find((candidate) => candidate.id === id);
  const matrix = implementationMatrix.items.find((candidate) => candidate.id === id);
  const contract = documentationContractFor(id);
  if (
    item === undefined ||
    catalogItem === undefined ||
    matrix === undefined ||
    contract === null
  ) {
    return null;
  }
  const api = apiIndex.entries.find((entry) => entry.id === id) ?? null;
  const contractDocument = recordValue(contract.semanticInteractionContract.document);
  const contractSemantics = stringValues(contract.semanticInteractionContract.semantics);
  const semantics =
    contractSemantics.length === 0 ? stringValues(contractDocument?.semantics) : contractSemantics;
  const evidenceRequirements = contractEvidenceRequirements(contractDocument);
  const declaredLimitations = stringValues(contractDocument?.limitations);
  const specimens = stateLabLinks(contract, item.route);
  const canonicalSource = matrix.packageSourceShadcnParity.artifacts.canonicalSource;
  const base = {
    schemaVersion: MACHINE_SCHEMA_VERSION,
    kind: item.routeKind === "kit" ? "kit-doc" : "item-doc",
    id: item.id,
    displayName: item.displayName,
    family: item.category,
    layer: item.layer,
    summary: item.summary,
    normativeBehavior: catalogItem.normativeBehavior,
    canonicalUrl: absoluteSiteUrl(item.route),
    immutableVersionUrl: null,
    contentVersion: CONTENT_VERSION,
    sourceCommit: SOURCE_COMMIT,
    publicationStatus: "blocked-unreleased",
    sourceAvailable: item.sourceAvailable,
    implementationStatus: item.implementationStatus,
    targetMaturity: item.targetMaturity,
    publishedMaturity: item.publishedMaturity,
    trust: item.trust,
    riskClass: item.riskClass,
    requiredStateGroups: catalogItem.requiredStateGroups,
    requiredEvidenceFamilies: catalogItem.requiredEvidenceFamilies,
    anatomy: {
      status: contract.anatomy.status,
      sourceKind: contract.anatomy.sourceKind,
      sourcePath: contract.anatomy.sourcePath,
      document: contract.anatomy.document,
      evidenceStatus:
        contract.anatomy.status === "documented"
          ? "source-documented-release-evidence-incomplete"
          : "source-metadata-only-release-evidence-incomplete",
      missingEvidenceLabel:
        contract.anatomy.status === "documented"
          ? "Generated source anatomy is present, but it is not release-bound quality evidence."
          : "A reviewed anatomy contract is missing; generated metadata is exposed without upgrading the evidence claim.",
    },
    stateApplicability: {
      status: contract.stateApplicability.status,
      sourcePath: contract.stateApplicability.sourcePath,
      reason: contract.stateApplicability.reason,
      states: specimens.states,
      evidenceStatus:
        contract.stateApplicability.status === "available"
          ? "source-inventory-present-release-evidence-incomplete"
          : "source-inventory-incomplete",
      missingEvidenceLabel:
        contract.stateApplicability.status === "available"
          ? "State applicability and source story pointers are generated, but release-bound state evidence remains incomplete."
          : (contract.stateApplicability.reason ??
            "A complete generated state-applicability inventory is not available."),
    },
    accessibilityContract: {
      status: contract.semanticInteractionContract.status,
      sourceStatus: contract.semanticInteractionContract.sourceStatus,
      sourcePath: contract.semanticInteractionContract.sourcePath,
      contractVersion: contract.semanticInteractionContract.contractVersion,
      claim: contract.semanticInteractionContract.claim,
      reason: contract.semanticInteractionContract.reason ?? null,
      semantics,
      keyboard: keyboardContract(contractDocument, semantics),
      preferences: recordValue(contractDocument?.preferences),
      responsive: recordValue(contractDocument?.responsive),
      evidenceRequirements,
      recordedEvidence: contract.semanticInteractionContract.recordedEvidence,
      evidenceStatus:
        contract.semanticInteractionContract.recordedEvidence.length === 0
          ? "not-tested"
          : "repository-records-present-release-binding-required",
      missingEvidenceLabel:
        contract.semanticInteractionContract.status === "draft-unavailable"
          ? (contract.semanticInteractionContract.reason ??
            "The semantic and interaction contract is an unavailable draft.")
          : contract.semanticInteractionContract.recordedEvidence.length === 0
            ? "The source contract is available, but no release-bound accessibility record is attached."
            : "Repository records are present; immutable release binding and manual review are still required.",
    },
    api,
    implementation: {
      profileStatus: matrix.profileStatus,
      ordinaryShadcnBaseline: matrix.ordinaryShadcnBaseline,
      mergoraAdvantage: matrix.mergoraAdvantage,
      visualSignature: matrix.visualSignature,
      optionalEnhancements: matrix.optionalEnhancements,
      storybook: matrix.storybook,
      accessibilityEvidence: matrix.accessibilityEvidence,
      interactionEvidence: matrix.interactionEvidence,
      packageSourceShadcnParity: matrix.packageSourceShadcnParity,
      maturity: matrix.maturity,
      remainingBlockers: matrix.remainingBlockers,
    },
    sourceAndEvidence: {
      source: {
        available: item.sourceAvailable,
        implementationStatus: item.implementationStatus,
        canonicalPath: canonicalSource,
        canonicalUrl: repositoryFileUrl(canonicalSource, currentSourceCommit()),
      },
      contract: {
        status: contract.semanticInteractionContract.status,
        sourceStatus: contract.semanticInteractionContract.sourceStatus,
        sourcePath: contract.semanticInteractionContract.sourcePath,
        sourceUrl:
          contract.semanticInteractionContract.sourcePath === null
            ? null
            : repositoryFileUrl(
                contract.semanticInteractionContract.sourcePath,
                currentSourceCommit(),
              ),
      },
      evidence: {
        releaseStatus: "incomplete",
        accessibility: matrix.accessibilityEvidence,
        interaction: matrix.interactionEvidence,
        parity: matrix.packageSourceShadcnParity.assessment,
        maturity: matrix.maturity.assessment,
        missingEvidenceLabel:
          "Repository evidence is checkpoint context, not an immutable released Quality Passport; open blockers remain authoritative.",
      },
    },
    specimens,
    guidance: {
      migration: {
        status: "no-public-release-history",
        documentationUrl: absoluteSiteUrl("/docs/migrations"),
        message:
          "No public version has been released. Review plan-first update and migration guidance before adopting any breaking contract change.",
      },
      issues: {
        repository: "https://github.com/AkhilTrivediX/mergora/issues",
        itemQuery: `https://github.com/AkhilTrivediX/mergora/issues?q=${encodeURIComponent(`is:issue ${id}`)}`,
      },
      limitations: {
        reviewStatus: "not-release-reviewed",
        declarations: declaredLimitations,
        blockers: matrix.remainingBlockers,
        missingEvidenceLabel:
          declaredLimitations.length === 0
            ? "No reviewed item-specific limitation declaration is supplied; this is not evidence that limitations do not exist."
            : "Source limitation declarations are present but have not been reviewed against a public release.",
      },
    },
    related: {
      passport: absoluteSiteUrl(`/quality/${id}`),
      machineJson: absoluteSiteUrl(
        item.routeKind === "kit" ? `/m/v1/kits/${id}.json` : `/m/v1/items/${id}.json`,
      ),
      machineMarkdown: absoluteSiteUrl(
        item.routeKind === "kit" ? `/m/v1/kits/${id}.md` : `/m/v1/items/${id}.md`,
      ),
      registryItem: absoluteSiteUrl(`/r/v1/items/${id}.json`),
      documentationNavigation: absoluteSiteUrl("/m/v1/documentation-navigation.json"),
    },
    reviewNotice: REVIEW_NOTICE,
  } as const;
  return withDigest(base);
}

export function itemMachineMarkdown(id: string): string | null {
  const document = itemMachineDocument(id);
  if (document === null) return null;
  const advantage = document.implementation.mergoraAdvantage.summary ?? "Not evidenced.";
  const baseline = document.implementation.ordinaryShadcnBaseline.summary ?? "Not documented.";
  const apiLines =
    document.api === null
      ? ["Prop-level API extraction is unavailable."]
      : document.api.groups.flatMap((group) => {
          const props = document.api?.props.filter((prop) => prop.owner === group.name) ?? [];
          return [
            `### ${group.name}`,
            "",
            `Source: ${group.sourcePath}`,
            ...(group.heritage.length === 0 ? [] : [`Inherits: ${group.heritage.join(" & ")}`]),
            "",
            ...(props.length === 0
              ? ["No locally declared props; inspect the inherited public surface."]
              : props.map(
                  (prop) =>
                    `- \`${prop.name}\`: \`${prop.type}\`; default \`${prop.defaultValue ?? (prop.required ? "required" : prop.defaultStatus)}\`; ${prop.description ?? "curated description requires review"}; semantic signal ${prop.semanticContract}; localization ${prop.localizationBehavior}.`,
                )),
            "",
          ];
        });
  const stateLines = document.stateApplicability.states.map(
    (state) =>
      `- ${state.id}: ${state.applicability}; story ${state.evidenceStatus}; ${state.url ?? "no State Lab link (not applicable)"}${state.rationale === null ? "" : `; rationale: ${state.rationale}`}`,
  );
  const semanticLines =
    document.accessibilityContract.semantics.length === 0
      ? [document.accessibilityContract.missingEvidenceLabel]
      : document.accessibilityContract.semantics.map((statement) => `- ${statement}`);
  return [
    `# ${document.displayName}`,
    "",
    document.summary,
    "",
    `Canonical: ${document.canonicalUrl}`,
    `Source: ${document.sourceAvailable ? "present" : "planned"}`,
    `Published maturity: ${document.publishedMaturity ?? "none"}`,
    `Target maturity: ${document.targetMaturity}`,
    `Content version: ${document.contentVersion}`,
    `Source commit: ${document.sourceCommit}`,
    `Digest: ${document.generatedDigest}`,
    `Publication status: ${document.publicationStatus}`,
    "",
    "## Normative behavior",
    "",
    document.normativeBehavior,
    "",
    "## Ordinary Shadcn baseline",
    "",
    baseline,
    "",
    "## Mergora advantage",
    "",
    advantage,
    "",
    "## Optional enhancements",
    "",
    ...(document.implementation.optionalEnhancements.items.length === 0
      ? ["No enhancement contract is evidenced yet."]
      : document.implementation.optionalEnhancements.items.map(
          (enhancement) =>
            `- ${enhancement.id}: ${enhancement.summary} Disable with ${enhancement.api.names.join(", ")}.`,
        )),
    "",
    "## Generated anatomy",
    "",
    `Status: ${document.anatomy.status}`,
    `Source: ${document.anatomy.sourcePath ?? "not supplied"}`,
    `Evidence: ${document.anatomy.evidenceStatus}`,
    document.anatomy.missingEvidenceLabel,
    "",
    "```json",
    JSON.stringify(document.anatomy.document, null, 2) ?? "null",
    "```",
    "",
    "## State applicability and exact State Lab links",
    "",
    `Inventory status: ${document.stateApplicability.status}`,
    `Evidence: ${document.stateApplicability.evidenceStatus}`,
    document.stateApplicability.missingEvidenceLabel,
    "",
    `- Basic: ${document.specimens.basic.url} (${document.specimens.basic.evidenceStatus})`,
    `- Recommended: ${document.specimens.recommended.url} (${document.specimens.recommended.evidenceStatus})`,
    `- State Lab: ${document.specimens.stateLab}`,
    ...stateLines,
    "",
    "## Keyboard and accessibility contract",
    "",
    `Contract status: ${document.accessibilityContract.status}`,
    `Source status: ${document.accessibilityContract.sourceStatus}`,
    `Source: ${document.accessibilityContract.sourcePath ?? "not supplied"}`,
    `Evidence: ${document.accessibilityContract.evidenceStatus}`,
    document.accessibilityContract.missingEvidenceLabel,
    "",
    ...semanticLines,
    "",
    "### Keyboard and focus statements",
    "",
    ...(document.accessibilityContract.keyboard.semanticStatements.length === 0
      ? ["No explicit keyboard or focus statement was extracted from the source contract."]
      : document.accessibilityContract.keyboard.semanticStatements.map(
          (statement) => `- ${statement}`,
        )),
    "",
    `Automated evidence requested: ${document.accessibilityContract.evidenceRequirements.automated.join(", ") || "not supplied"}.`,
    `Manual evidence requested: ${document.accessibilityContract.evidenceRequirements.manual.join(", ") || "not supplied"}.`,
    "",
    "## Public API",
    "",
    ...apiLines,
    "## Source, contract, and evidence status",
    "",
    `- Canonical source: ${document.sourceAndEvidence.source.canonicalPath}`,
    `- Source status: ${document.sourceAndEvidence.source.implementationStatus}`,
    `- Contract status: ${document.sourceAndEvidence.contract.status} (${document.sourceAndEvidence.contract.sourceStatus})`,
    `- Accessibility evidence: ${document.sourceAndEvidence.evidence.accessibility.status}`,
    `- Interaction evidence: ${document.sourceAndEvidence.evidence.interaction.status}`,
    `- Package/source/Shadcn parity: ${document.sourceAndEvidence.evidence.parity.status}`,
    `- Maturity assessment: ${document.sourceAndEvidence.evidence.maturity.status}`,
    `- Release evidence: ${document.sourceAndEvidence.evidence.releaseStatus}. ${document.sourceAndEvidence.evidence.missingEvidenceLabel}`,
    "",
    "## Migration, issues, and limitations",
    "",
    `Migration status: ${document.guidance.migration.status}. ${document.guidance.migration.message}`,
    `Migration guidance: ${document.guidance.migration.documentationUrl}`,
    `Issue query: ${document.guidance.issues.itemQuery}`,
    `Limitation review: ${document.guidance.limitations.reviewStatus}. ${document.guidance.limitations.missingEvidenceLabel}`,
    "",
    ...(document.guidance.limitations.declarations.length === 0
      ? ["No reviewed source limitation declaration is available."]
      : document.guidance.limitations.declarations.map((limitation) => `- ${limitation}`)),
    "",
    "## Open blockers",
    "",
    ...(document.implementation.remainingBlockers.length === 0
      ? ["No blockers are recorded in this checkpoint."]
      : document.implementation.remainingBlockers.map(
          (blocker) => `- ${blocker.code}: ${blocker.summary}`,
        )),
    "",
    "## Machine resources",
    "",
    `- JSON: ${document.related.machineJson}`,
    `- Markdown: ${document.related.machineMarkdown}`,
    `- Quality Passport: ${document.related.passport}`,
    `- Registry item: ${document.related.registryItem}`,
    `- Documentation navigation: ${document.related.documentationNavigation}`,
    "",
    `> ${document.reviewNotice}`,
    "",
  ].join("\n");
}

export const docsMachineSlugs = documentationPages.map((page) => page.slug);
export const itemMachineIds = docsIndex.items
  .filter((item) => item.routeKind !== "kit")
  .map((item) => item.id);
export const kitMachineIds = docsIndex.items
  .filter((item) => item.routeKind === "kit")
  .map((item) => item.id);
export const passportMachineIds = documentationContractIndex.items.map((item) => item.id);
