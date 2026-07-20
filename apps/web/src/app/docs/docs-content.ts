export interface DocumentationSection {
  readonly code?: string;
  readonly heading: string;
  readonly paragraphs: readonly string[];
}

export interface DocumentationPage {
  readonly description: string;
  readonly sections: readonly DocumentationSection[];
  readonly slug: string;
  readonly title: string;
}

export interface DocumentationNavigationLink {
  readonly label: string;
  readonly route: string;
}

/**
 * Machine navigation mirrors the visible shell and is parity-tested against it. Keeping this
 * model beside the authored documentation order gives non-visual clients deterministic global,
 * footer, and previous/next traversal without changing the generated catalog graph.
 */
export const globalDocumentationNavigation: readonly DocumentationNavigationLink[] = [
  { label: "Components", route: "/components" },
  { label: "Systems", route: "/systems" },
  { label: "Kits", route: "/kits" },
  { label: "Studio", route: "/studio" },
  { label: "Docs", route: "/docs" },
] as const;

export const footerDocumentationNavigation: readonly DocumentationNavigationLink[] = [
  { label: "Quality evidence", route: "/quality" },
  { label: "Support", route: "/support" },
  { label: "Community", route: "/community" },
  { label: "GitHub repository", route: "https://github.com/AkhilTrivediX/mergora" },
] as const;

export function documentationSectionId(heading: string): string {
  return heading.toLocaleLowerCase("en-US").replaceAll(/[^a-z0-9]+/gu, "-");
}

export const documentationPages: readonly DocumentationPage[] = [
  {
    slug: "installation",
    title: "Installation and distribution modes",
    description:
      "Choose editable source, package imports, or Shadcn-compatible evaluation without confusing one ownership model for another.",
    sections: [
      {
        heading: "Prerequisites",
        paragraphs: [
          "The unreleased workspace is verified against Node 24, pnpm 11, React 19, and clean Next.js and Vite consumers. Published compatibility does not exist until the release gates pass.",
          "Source mode writes reviewed canonical source into your project. Package mode records an exact package-owned range. Compatible registry output is an evaluation surface, not a separate source of truth.",
        ],
      },
      {
        heading: "Plan before writing",
        paragraphs: [
          "The operation plan resolves dependencies, paths, ownership, formatting policy, and provenance before mutation. A stale or altered plan is rejected.",
        ],
        code: "pnpm dlx mergora@0.0.0 add button --mode source --plan",
      },
      {
        heading: "Current publication boundary",
        paragraphs: [
          "Version 0.0.0 commands on this site are prepared contracts used by the repository’s test fixtures. They are not an npm availability claim. Use packed workspace artifacts for current evaluation.",
        ],
      },
    ],
  },
  {
    slug: "quick-start",
    title: "Quick start",
    description: "The shortest honest path from a clean consumer to a reviewed first write.",
    sections: [
      {
        heading: "Choose a consumer",
        paragraphs: [
          "Create a clean Next.js or Vite project with the supported runtime, then select source or package ownership explicitly. The repository exercises both consumers from packed tarballs rather than workspace links.",
        ],
      },
      {
        heading: "Inspect the plan",
        paragraphs: [
          "Start with a dry, human-readable plan. Confirm file destinations, package changes, token fragments, and ownership before applying the same operation.",
        ],
        code: "pnpm dlx mergora@0.0.0 add button --mode source --plan",
      },
      {
        heading: "Verify success",
        paragraphs: [
          "Run the consumer typecheck and production build, submit and reset any affected form, and inspect keyboard and forced-color behavior. Do not infer compatibility from rendering alone.",
        ],
      },
    ],
  },
  {
    slug: "configuration",
    title: "Configuration",
    description: "Understand mergora.json discovery, aliases, ownership, and strict validation.",
    sections: [
      {
        heading: "Discovery",
        paragraphs: [
          "The CLI discovers the nearest valid project configuration from the requested working directory. Invalid parent or cross-project configuration is rejected instead of silently guessed.",
        ],
      },
      {
        heading: "Ownership and mode",
        paragraphs: [
          "Configuration may establish a default source or package mode, while an explicit command flag may make the operation choice visible. Mixed projects retain per-item provenance rather than rewriting all items into one mode.",
        ],
      },
      {
        heading: "Validation",
        paragraphs: [
          "Unknown required shapes, traversal, overlapping destinations, unsafe aliases, and ambiguous registry identity fail before mutation. Schema changes remain versioned and test-backed.",
        ],
      },
    ],
  },
  {
    slug: "theming",
    title: "Tokens, modes, and styling",
    description: "Use Mergora’s DTCG-backed semantic tokens without copying component internals.",
    sections: [
      {
        heading: "Semantic first",
        paragraphs: [
          "Components consume semantic focus, status, selection, motion, density, surface, border, and typography tokens. Primitive values remain an implementation layer, not the component API.",
        ],
      },
      {
        heading: "Modes and preferences",
        paragraphs: [
          "Light, dark, enhanced-contrast, forced-colors, compact, comfortable, and touch outputs are generated from one canonical token graph. Reduced motion changes timing without removing state communication.",
        ],
      },
      {
        heading: "Guardrails",
        paragraphs: [
          "Mergora surfaces use restrained corners, literal surfaces, ink structure, strong typography, and bounded green/violet signals. Token overrides must preserve contrast and focus visibility.",
        ],
      },
    ],
  },
  {
    slug: "semantic-sync",
    title: "Semantic Sync",
    description: "Preserve local source ownership while applying verified upstream change.",
    sections: [
      {
        heading: "Base, local, and target",
        paragraphs: [
          "The immutable base records what was installed. Local is the consumer-owned tree. Target is a verified upstream payload. Non-overlapping edits can merge; conflicts remain isolated for explicit resolution.",
        ],
      },
      {
        heading: "One canonical operation plan",
        paragraphs: [
          "Status, diff, add, update, recovery, and migration mutations converge on one validated plan/finalizer boundary. The live tree changes only after the complete plan passes stale-input and ownership checks.",
        ],
      },
      {
        heading: "Recovery",
        paragraphs: [
          "Transactional backups, provenance digests, operation journals, and deterministic rollback protect the pre-operation state. Recovery never trusts an altered stored plan.",
        ],
      },
    ],
  },
  {
    slug: "contracts",
    title: "Local Contract Audit",
    description: "Test the application-specific promises a generic component library cannot prove.",
    sections: [
      {
        heading: "What contracts cover",
        paragraphs: [
          "A local contract connects component semantics to the consumer’s labels, validation, routing, data, permissions, and recovery behavior. It complements library tests rather than duplicating them.",
        ],
      },
      {
        heading: "Prepared browser runner",
        paragraphs: [
          "The current runner audits role/name/query expectations and runtime interaction in Chromium. Broader manager, framework, operating-system, and assistive-technology evidence remains a release gate.",
        ],
      },
      {
        heading: "Limitations",
        paragraphs: [
          "Passing an automated contract does not prove usability, product correctness, authorization, or complete screen-reader behavior. Record those methods separately.",
        ],
      },
    ],
  },
  {
    slug: "accessibility",
    title: "Accessibility policy",
    description: "Understand Mergora’s target, evidence language, and consumer responsibilities.",
    sections: [
      {
        heading: "Target and evidence",
        paragraphs: [
          "Mergora targets WCAG 2.2 AA-aligned component behavior and relevant APG patterns. Automated axe, keyboard, reflow, forced-color, and reduced-motion checks are evidence families, not complete coverage.",
        ],
      },
      {
        heading: "Manual methods",
        paragraphs: [
          "Stable promotion requires applicable desktop and mobile screen readers, speech, switch, touch, keyboard, zoom, and real-device records. Missing records stay visible in the Quality Passport.",
        ],
      },
      {
        heading: "Consumer boundary",
        paragraphs: [
          "Consumers own accessible names, instructions, content order, application routing, backend errors, localization, authorization, and end-to-end testing in the composed product.",
        ],
      },
    ],
  },
  {
    slug: "responsive-and-i18n",
    title: "Responsive, locale, and direction contracts",
    description:
      "Build components that survive narrow containers, long strings, locale change, and RTL.",
    sections: [
      {
        heading: "Content-driven reflow",
        paragraphs: [
          "Components use logical properties and container-safe sizing. Intentionally scrollable tables, code, and grids expose bounded regions without expanding the page viewport.",
        ],
      },
      {
        heading: "Locale and canonical values",
        paragraphs: [
          "Display formatting may follow locale while canonical form and adapter values remain explicit. Partial editing must not coerce the user into a different value before input is complete.",
        ],
      },
      {
        heading: "RTL and input modality",
        paragraphs: [
          "Direction-aware keyboard behavior is tested independently from visual mirroring. Touch targets, pointer behavior, keyboard focus, and screen-reader output remain separately operable.",
        ],
      },
    ],
  },
  {
    slug: "registry",
    title: "Registry protocols and trust",
    description: "Resolve native and Shadcn-compatible items without weakening registry ownership.",
    sections: [
      {
        heading: "Canonical native registry",
        paragraphs: [
          "Native search, view, add, and update use exact enrolled registry identity, offline payloads, and provenance. The canonical registry definitions generate all compatible outputs.",
        ],
      },
      {
        heading: "Enrollment and trust",
        paragraphs: [
          "Private and alternate registries require explicit enrollment and trust policy. Ambiguous aliases, unverified mirrors, unexpected authentication, and cross-registry ownership are rejected.",
        ],
      },
      {
        heading: "Durability",
        paragraphs: [
          "Release registry endpoints are immutable static assets mirrored in release bundles. Online and mirror failover evidence remains open until a public release exists.",
        ],
      },
    ],
  },
  {
    slug: "cli",
    title: "CLI task index",
    description: "Understand read, plan, mutation, JSON, and recovery boundaries.",
    sections: [
      {
        heading: "Read before mutation",
        paragraphs: [
          "Search, view, status, and diff expose resolved identity and ownership. Add, update, remove, migration, and recovery paths must produce or consume a validated canonical operation plan.",
        ],
      },
      {
        heading: "Output contracts",
        paragraphs: [
          "Human output explains the next safe action. JSON output remains schema-versioned and deterministic. Exit codes distinguish usage, trust, conflict, stale plan, write, and recovery failures.",
        ],
      },
      {
        heading: "Formatting",
        paragraphs: [
          "Formatting is an explicit post-plan operation. The no-format option removes formatter behavior without altering source ownership, transaction, or provenance guarantees.",
        ],
      },
    ],
  },
  {
    slug: "migrations",
    title: "Migrations and deprecations",
    description: "Review behavior change before adopting a new component or CLI contract.",
    sections: [
      {
        heading: "No silent breakage",
        paragraphs: [
          "Backward-compatible additions preserve existing public behavior. An unavoidable breaking change needs a versioned migration, explicit changed-contract evidence, and recovery guidance.",
        ],
      },
      {
        heading: "Mode and framework movement",
        paragraphs: [
          "Moving between source and package ownership, framework layouts, or compatible registry surfaces is a planned operation with exact provenance—not a search-and-replace shortcut.",
        ],
      },
      {
        heading: "Current release state",
        paragraphs: [
          "No public version has been released, so there is no historical upgrade guide yet. Current compatibility changes remain repository checkpoints only.",
        ],
      },
    ],
  },
  {
    slug: "mcp-and-agents",
    title: "MCP and agent workflows",
    description:
      "Give tools authoritative, reviewable context without granting unsafe mutation shortcuts.",
    sections: [
      {
        heading: "Read resources first",
        paragraphs: [
          "Machine clients should resolve catalog IDs, API records, Markdown documentation, evidence, and exact registry identity before proposing an operation.",
        ],
      },
      {
        heading: "Safe mutation model",
        paragraphs: [
          "Agent-triggered writes use the same operation-plan, transaction, ownership, and stale-input checks as interactive CLI use. Tools may not invent paths or bypass provenance.",
        ],
      },
      {
        heading: "Current boundary",
        paragraphs: [
          "MCP smoke tests exist in the repository, while public production endpoints and immutable release resources remain blocked until publication gates pass.",
        ],
      },
    ],
  },
];

export function findDocumentationPage(slug: string): DocumentationPage | undefined {
  return documentationPages.find((page) => page.slug === slug);
}

export function documentationPageNeighbors(slug: string): {
  readonly next: DocumentationPage | null;
  readonly previous: DocumentationPage | null;
} {
  const index = documentationPages.findIndex((page) => page.slug === slug);
  if (index < 0) return { next: null, previous: null };
  return {
    next: documentationPages[index + 1] ?? null,
    previous: documentationPages[index - 1] ?? null,
  };
}
