import { SiteLink as Link } from "./site-link";

import apiIndex from "../../../../content/generated/api-index.json";
import docsIndex from "../../../../content/generated/docs-index.json";
import catalog from "../../../../registry/generated/catalog.json";
import documentationContracts from "../../../../registry/generated/documentation-contract-index.v1.json";
import implementationMatrix from "../../../../registry/generated/implementation-matrix.v1.json";
import { DeferredApiReference } from "./deferred-api-reference";
import { InstallBasketButton } from "./install-basket-button";
import {
  createInstallBasketCliPlan,
  CURRENT_INSTALL_BASKET_CLI_CONTEXT,
  DEFAULT_INSTALL_BASKET_OPTIONS,
} from "./install-basket";
import { SpecimenFrame } from "./specimen-frame";
import { StateLab } from "./state-lab";
import { buildStateLabModel, type DocumentationContractItem } from "./state-lab-model";

interface EvidenceReference {
  readonly kind: string;
  readonly location: string;
}

interface EvidenceAssessment {
  readonly references?: readonly EvidenceReference[];
  readonly status?: string;
  readonly summary?: string | null;
}

interface OptionalEnhancement {
  readonly api: {
    readonly names: readonly string[];
  };
  readonly defaultEnabled: boolean;
  readonly disabledBehavior: {
    readonly accessibility: string;
    readonly behavior: string;
    readonly events: string;
    readonly ui: string;
  };
  readonly id: string;
  readonly status: string;
  readonly summary: string;
}

interface ApiProp {
  readonly controlledPair: string | null;
  readonly defaultStatus: string;
  readonly defaultValue: string | null;
  readonly description: string | null;
  readonly localizationBehavior: string;
  readonly name: string;
  readonly owner: string;
  readonly required: boolean;
  readonly runtimeBoundary: string;
  readonly semanticContract: string;
  readonly sourcePath: string;
  readonly type: string;
}

interface ApiPropGroup {
  readonly declarationKind: string;
  readonly heritage: readonly string[];
  readonly name: string;
  readonly sourcePath: string;
  readonly typeParameters: readonly string[];
}

interface ApiEntry {
  readonly exports: readonly string[];
  readonly groups: readonly ApiPropGroup[];
  readonly id: string;
  readonly message: string;
  readonly props: readonly ApiProp[];
  readonly summary: {
    readonly describedProps: number;
    readonly propGroups: number;
    readonly props: number;
    readonly runtimeDefaults: number;
  };
}

interface MatrixEntry {
  readonly accessibilityEvidence: EvidenceAssessment;
  readonly interactionEvidence: EvidenceAssessment;
  readonly maturity: {
    readonly assessment: {
      readonly rationale?: string | null;
      readonly status: string;
    };
    readonly published: string | null;
    readonly target: string;
  };
  readonly mergoraAdvantage: EvidenceAssessment;
  readonly optionalEnhancements: {
    readonly items: readonly OptionalEnhancement[];
    readonly status: string;
  };
  readonly ordinaryShadcnBaseline: EvidenceAssessment;
  readonly packageSourceShadcnParity: {
    readonly artifacts: Record<string, string>;
    readonly assessment: EvidenceAssessment;
  };
  readonly profileStatus: string;
  readonly remainingBlockers: readonly {
    readonly code: string;
    readonly summary: string;
  }[];
  readonly storybook: {
    readonly basic: {
      readonly exportName?: string | null;
      readonly modulePath?: string | null;
      readonly status: string;
    };
    readonly enhanced: {
      readonly exportName?: string | null;
      readonly modulePath?: string | null;
      readonly status: string;
    };
  };
  readonly visualSignature: EvidenceAssessment & {
    readonly patternIds?: readonly string[];
    readonly tokenReferences?: readonly string[];
  };
}

export type DocumentationRouteKind = "component" | "kit" | "system";

export function documentationItems(routeKind: DocumentationRouteKind) {
  return docsIndex.items.filter((item) => item.routeKind === routeKind);
}

export function findDocumentationItem(routeKind: DocumentationRouteKind, id: string) {
  return documentationItems(routeKind).find((item) => item.id === id);
}

function statusLabel(value: string): string {
  return value.replaceAll("-", " ");
}

function EvidenceText({ evidence }: { readonly evidence: EvidenceAssessment }) {
  const status =
    evidence.status ??
    (evidence.summary === null || evidence.summary === undefined ? "not-verified" : "documented");
  return (
    <div className="item-evidence-text" data-status={status}>
      <strong>{statusLabel(status)}</strong>
      <p>{evidence.summary ?? "No verified summary is available for this checkpoint."}</p>
    </div>
  );
}

export function ItemDocumentation({
  id,
  routeKind,
}: {
  readonly id: string;
  readonly routeKind: DocumentationRouteKind;
}) {
  const item = findDocumentationItem(routeKind, id);
  if (item === undefined) return null;
  const catalogItem = catalog.items.find((candidate) => candidate.id === id)!;
  const matrix = implementationMatrix.items.find(
    (candidate) => candidate.id === id,
  ) as unknown as MatrixEntry;
  const api = apiIndex.entries.find((entry) => entry.id === id) as unknown as ApiEntry | undefined;
  const documentationContract = documentationContracts.items.find(
    (candidate) => candidate.id === id,
  ) as unknown as DocumentationContractItem | undefined;
  const related = docsIndex.items
    .filter((candidate) => candidate.category === item.category && candidate.id !== id)
    .slice(0, 4);
  const basicStory = matrix.storybook.basic;
  const enhancedStory = matrix.storybook.enhanced;
  const sourceInstallPlan = createInstallBasketCliPlan(
    [id],
    DEFAULT_INSTALL_BASKET_OPTIONS,
    CURRENT_INSTALL_BASKET_CLI_CONTEXT,
  );
  const packageInstallPlan = createInstallBasketCliPlan(
    [id],
    { ...DEFAULT_INSTALL_BASKET_OPTIONS, mode: "package" },
    CURRENT_INSTALL_BASKET_CLI_CONTEXT,
  );
  const controlledPairs =
    api?.props
      .filter((prop) => prop.controlledPair !== null && !prop.name.startsWith("default"))
      .map((prop) => `${prop.name} / ${prop.controlledPair}`)
      .filter((pair, index, pairs) => pairs.indexOf(pair) === index) ?? [];

  return (
    <main className="item-page" id="main-content">
      <header className="item-page__identity">
        <nav aria-label="Breadcrumb">
          <Link href={`/${routeKind}s`}>{routeKind}s</Link>
          <span aria-hidden="true">/</span>
          <span aria-current="page">{item.displayName}</span>
        </nav>
        <p className="site-eyebrow">{item.category.replaceAll("-", " ")}</p>
        <h1>{item.displayName}</h1>
        <p>{item.summary}</p>
        <dl>
          <div>
            <dt>Source</dt>
            <dd>{item.sourceAvailable ? "Canonical source present" : "Planned"}</dd>
          </div>
          <div>
            <dt>Published maturity</dt>
            <dd>{item.publishedMaturity ?? "Not released"}</dd>
          </div>
          <div>
            <dt>Trust / risk</dt>
            <dd>
              {item.trust} / {item.riskClass}
            </dd>
          </div>
          <div>
            <dt>Matrix</dt>
            <dd>{statusLabel(matrix.profileStatus)}</dd>
          </div>
        </dl>
      </header>

      <div className="item-page__layout">
        <nav aria-label="On this page" className="item-page__contents">
          <strong>On this page</strong>
          <a href="#install">Install</a>
          <a href="#default">Default specimen</a>
          <a href="#advantage">Mergora advantage</a>
          <a href="#states">State and interaction</a>
          <a href="#state-lab">State Lab</a>
          <a href="#usage">Usage and composition</a>
          <a href="#anatomy">Anatomy</a>
          <a href="#api">API</a>
          <a href="#styling">Styling and tokens</a>
          <a href="#responsive">Responsive and input</a>
          <a href="#i18n">Internationalization</a>
          <a href="#accessibility">Accessibility</a>
          <a href="#quality">Quality Passport</a>
          <a href="#source">Source and migration</a>
          <a href="#limitations">Limitations</a>
        </nav>

        <article className="item-page__content">
          <section id="install">
            <p className="site-eyebrow">Install workbench</p>
            <h2>Review the write plan first.</h2>
            {item.sourceAvailable ? (
              <>
                <div className="item-install-grid">
                  <div>
                    <strong>Source mode</strong>
                    {sourceInstallPlan.status === "ready" ? (
                      <code>{sourceInstallPlan.command}</code>
                    ) : (
                      <span>{sourceInstallPlan.message}</span>
                    )}
                  </div>
                  <div>
                    <strong>Package mode unavailable</strong>
                    <span>
                      {packageInstallPlan.status === "unavailable"
                        ? packageInstallPlan.message
                        : "An exact release is available; use the dependency-aware install basket to build its checked command."}
                    </span>
                  </div>
                </div>
                <p className="item-page__caveat">
                  The source command uses the initialized projectâ€™s framework profile. Package
                  mode stays fail-closed until an exact verified release file exists; no placeholder
                  is presented as executable.
                </p>
                <InstallBasketButton itemId={id} />
              </>
            ) : (
              <p className="item-page__caveat">
                No install command is offered because canonical source is not present yet.
              </p>
            )}
          </section>

          <section id="default">
            <p className="site-eyebrow">Live default specimen</p>
            <h2>Basic behavior before enhancement.</h2>
            {basicStory.modulePath !== null &&
            basicStory.modulePath !== undefined &&
            basicStory.exportName !== null &&
            basicStory.exportName !== undefined &&
            enhancedStory.modulePath !== null &&
            enhancedStory.modulePath !== undefined &&
            enhancedStory.exportName !== null &&
            enhancedStory.exportName !== undefined ? (
              <SpecimenFrame
                basic={{
                  exportName: basicStory.exportName,
                  modulePath: basicStory.modulePath,
                }}
                itemName={item.displayName}
                recommended={{
                  exportName: enhancedStory.exportName,
                  modulePath: enhancedStory.modulePath,
                }}
              />
            ) : (
              <p className="item-page__caveat">
                A browser-addressable Basic and Recommended specimen pair has not been recorded.
              </p>
            )}
            <div className="item-story-proof">
              <div>
                <span>Basic Storybook export</span>
                <strong>{basicStory.exportName ?? "Not recorded"}</strong>
                <small>{statusLabel(basicStory.status)}</small>
              </div>
              <div>
                <span>Recommended Mergora export</span>
                <strong>{enhancedStory.exportName ?? "Not recorded"}</strong>
                <small>{statusLabel(enhancedStory.status)}</small>
              </div>
            </div>
            {basicStory.modulePath === null || basicStory.modulePath === undefined ? null : (
              <p>Both specimens are owned by {basicStory.modulePath}.</p>
            )}
          </section>

          <section id="advantage">
            <p className="site-eyebrow">Baseline and advantage</p>
            <h2>What Mergora adds.</h2>
            <div className="item-comparison">
              <div>
                <h3>Ordinary Shadcn baseline</h3>
                <EvidenceText evidence={matrix.ordinaryShadcnBaseline} />
              </div>
              <div>
                <h3>Mergora-specific advantage</h3>
                <EvidenceText evidence={matrix.mergoraAdvantage} />
              </div>
            </div>
            {matrix.optionalEnhancements.items.length === 0 ? (
              <p>No optional enhancement contract has been evidenced yet.</p>
            ) : (
              <ul className="item-enhancements">
                {matrix.optionalEnhancements.items.map((enhancement) => (
                  <li key={enhancement.id}>
                    <h3>{enhancement.id.replaceAll("-", " ")}</h3>
                    <p>{enhancement.summary}</p>
                    <p>
                      API: <code>{enhancement.api.names.join(", ")}</code> · default{" "}
                      {enhancement.defaultEnabled ? "on" : "off"}
                    </p>
                    <details>
                      <summary>When disabled</summary>
                      <dl>
                        {Object.entries(enhancement.disabledBehavior).map(([key, value]) => (
                          <div key={key}>
                            <dt>{key}</dt>
                            <dd>{value}</dd>
                          </div>
                        ))}
                      </dl>
                    </details>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section id="states">
            <p className="site-eyebrow">State and interaction</p>
            <h2>Required behavior is explicit.</h2>
            <p>{catalogItem.normativeBehavior}</p>
            <dl className="item-evidence-grid">
              <div>
                <dt>Required state groups</dt>
                <dd>{catalogItem.requiredStateGroups.join(", ")}</dd>
              </div>
              <div>
                <dt>Interaction evidence</dt>
                <dd>
                  <EvidenceText evidence={matrix.interactionEvidence} />
                </dd>
              </div>
              <div>
                <dt>Visual signature</dt>
                <dd>
                  <EvidenceText evidence={matrix.visualSignature} />
                  {(matrix.visualSignature.patternIds ?? []).join(", ")}
                </dd>
              </div>
              <div>
                <dt>Responsive, direction, and preferences</dt>
                <dd>
                  Evidence must cover narrow reflow, touch, RTL, forced colors, and reduced motion;
                  incomplete coverage remains listed below.
                </dd>
              </div>
            </dl>
          </section>

          {documentationContract === undefined ? (
            <section id="state-lab">
              <p className="site-eyebrow">Catalog State Lab</p>
              <h2>Generated state contract unavailable.</h2>
              <p className="item-page__caveat">
                This item has no entry in the authoritative documentation contract index, so no
                state links or preview claims are presented.
              </p>
            </section>
          ) : (
            <StateLab model={buildStateLabModel(documentationContract)} />
          )}

          <section id="usage">
            <p className="site-eyebrow">Usage and composition</p>
            <h2>Start simple, then opt in.</h2>
            <p>
              The Basic specimen is the minimal public behavior with optional Mergora enhancements
              disabled. The Recommended specimen enables the family’s useful additions without
              changing the underlying ownership model.
            </p>
            <dl className="item-evidence-grid">
              <div>
                <dt>Controlled and uncontrolled pairs</dt>
                <dd>
                  {controlledPairs.length === 0
                    ? "No controlled/default pair is declared for this public surface."
                    : controlledPairs.join(", ")}
                </dd>
              </div>
              <div>
                <dt>Composition boundary</dt>
                <dd>
                  {item.serverBoundary.replaceAll("-", " ")}; consumers retain application data,
                  authorization, persistence, and network ownership.
                </dd>
              </div>
              <div>
                <dt>Required production states</dt>
                <dd>{catalogItem.requiredStateGroups.join(", ")}</dd>
              </div>
              <div>
                <dt>Enhancement contract</dt>
                <dd>
                  {matrix.optionalEnhancements.items.length} independently documented optional{" "}
                  {matrix.optionalEnhancements.items.length === 1 ? "enhancement" : "enhancements"}.
                </dd>
              </div>
            </dl>
          </section>

          <section id="anatomy">
            <p className="site-eyebrow">Anatomy and behavior model</p>
            <h2>Public parts stay explicit.</h2>
            <p>
              These generated type surfaces are the public composition boundary. Internal DOM order
              is not implied unless the component contract records it.
            </p>
            <p>
              The detailed generated source anatomy is available with the complete API reference
              below, without making every documentation route parse its largest prop table up front.
            </p>
          </section>

          <section id="api">
            <p className="site-eyebrow">API and source anatomy</p>
            <h2>Public surface and ownership.</h2>
            {api === undefined ? (
              <p>Prop-level API extraction is not available because the source is still planned.</p>
            ) : (
              <DeferredApiReference id={id} />
            )}
            <dl className="item-artifacts">
              {Object.entries(matrix.packageSourceShadcnParity.artifacts).map(([name, path]) => (
                <div key={name}>
                  <dt>{name}</dt>
                  <dd>
                    <code>{path}</code>
                  </dd>
                </div>
              ))}
            </dl>
            <EvidenceText evidence={matrix.packageSourceShadcnParity.assessment} />
          </section>

          <section id="styling">
            <p className="site-eyebrow">Styling and tokens</p>
            <h2>Semantic roles, not palette literals.</h2>
            <p>
              Shared semantic tokens establish focus, validation, selection, motion, density, touch,
              and forced-color behavior. Component-specific token evidence:{" "}
              <code>
                {(matrix.visualSignature.tokenReferences ?? []).join(", ") || "Not recorded"}
              </code>
              .
            </p>
            <dl className="item-evidence-grid">
              <div>
                <dt>Visual signature patterns</dt>
                <dd>{(matrix.visualSignature.patternIds ?? []).join(", ") || "Not recorded"}</dd>
              </div>
              <div>
                <dt>Package style import</dt>
                <dd>
                  <code>{item.packageStyleImport ?? "Source-mode CSS only"}</code>
                </dd>
              </div>
              <div>
                <dt>Density modes</dt>
                <dd>Comfortable, compact, and preferred touch targets through shared tokens.</dd>
              </div>
              <div>
                <dt>Preference modes</dt>
                <dd>Light, dark, enhanced contrast, forced-color mapping, and reduced motion.</dd>
              </div>
            </dl>
          </section>

          <section id="responsive">
            <p className="site-eyebrow">Responsive and input contract</p>
            <h2>Content determines adaptation.</h2>
            <dl className="item-evidence-grid">
              <div>
                <dt>Directions prepared</dt>
                <dd>{item.directions.join(", ")}</dd>
              </div>
              <div>
                <dt>Input evidence expected</dt>
                <dd>Keyboard, pointer, touch, coarse pointer, and narrow-screen reflow.</dd>
              </div>
              <div>
                <dt>Minimum public viewport</dt>
                <dd>
                  320 CSS pixels without page-level overflow; intentional inner overflow stays
                  operable.
                </dd>
              </div>
              <div>
                <dt>Current evidence</dt>
                <dd>
                  <EvidenceText evidence={matrix.interactionEvidence} />
                </dd>
              </div>
            </dl>
          </section>

          <section id="i18n">
            <p className="site-eyebrow">Internationalization and direction</p>
            <h2>Locale behavior remains visible.</h2>
            <p>
              Prepared locale evidence: {item.locales.join(", ")}. Built-in copy must remain
              localizable; consumer-provided labels, messages, dates, numbers, and time zones stay
              under consumer control.
            </p>
            <p>
              Logical start/end placement is used for direction-aware behavior. Mixed-direction user
              content, text expansion, IME composition, and portal direction remain part of the
              final composed-product verification boundary.
            </p>
          </section>

          <section id="accessibility">
            <p className="site-eyebrow">Accessibility contract</p>
            <h2>Automation is one evidence source.</h2>
            <EvidenceText evidence={matrix.accessibilityEvidence} />
            <p>
              Consumers remain responsible for accessible names, surrounding instructions,
              application state, localized copy, backend failures, and testing the final composed
              experience with relevant assistive technology.
            </p>
          </section>

          <section id="quality">
            <p className="site-eyebrow">Quality Passport</p>
            <h2>No detached certification claim.</h2>
            <p>{matrix.maturity.assessment.rationale ?? "Promotion evidence is incomplete."}</p>
            <Link href={`/quality/${id}`}>Inspect the item evidence record</Link>
          </section>

          <section id="source">
            <p className="site-eyebrow">Source, update, and migration</p>
            <h2>Ownership remains inspectable.</h2>
            <div className="item-install-grid">
              <div>
                <strong>Inspect local ownership</strong>
                <code>mergora status {id}</code>
              </div>
              <div>
                <strong>Preview upstream difference</strong>
                <code>mergora diff {id} --upstream</code>
              </div>
              <div>
                <strong>Plan an update</strong>
                <code>mergora update {id} --dry-run</code>
              </div>
              <div>
                <strong>Plan removal</strong>
                <code>mergora remove {id} --plan --json</code>
              </div>
            </div>
            <p>
              Commands remain plan-first and unreleased at this checkpoint. Conflicts require an
              explicit resolution transaction; migration guidance is required before any breaking
              public or accessibility behavior is published.
            </p>
          </section>

          <section id="limitations">
            <p className="site-eyebrow">Known limitations</p>
            <h2>Open gates remain visible.</h2>
            {matrix.remainingBlockers.length === 0 ? (
              <p>No blockers are recorded in this generated checkpoint.</p>
            ) : (
              <ul>
                {matrix.remainingBlockers.map((blocker) => (
                  <li key={blocker.code}>
                    <strong>{blocker.code}</strong>: {blocker.summary}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <nav aria-label="Related items" className="item-related">
            <strong>Related {item.category.replaceAll("-", " ")} items</strong>
            {related.map((candidate) => (
              <Link href={candidate.route} key={candidate.id}>
                {candidate.displayName}
              </Link>
            ))}
          </nav>
        </article>
      </div>
    </main>
  );
}
