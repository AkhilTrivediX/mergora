import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";

import { extractSitemapUrls, isExcludedSitemapUrl } from "./static-export-lib.mjs";

const outputRoot = resolve("apps/web/out");
const expectedBasePath = process.env.MERGORA_BASE_PATH ?? "";
const expectedSiteOrigin =
  process.env.MERGORA_SITE_ORIGIN ?? "https://akhiltrivedix.github.io/mergora";
const expectedOriginPath = new URL(expectedSiteOrigin).pathname.replace(/\/$/u, "");
const textExtensions = new Set([
  ".css",
  ".html",
  ".js",
  ".json",
  ".map",
  ".md",
  ".txt",
  ".webmanifest",
  ".xml",
]);

async function filesBelow(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory() ? filesBelow(path) : [path];
    }),
  );
  return nested.flat();
}

function fail(message) {
  process.stderr.write(`static export verification failed: ${message}\n`);
  process.exitCode = 1;
}

const index = await readFile(join(outputRoot, "index.html"), "utf8");
if (!index.includes(`${expectedBasePath}/_next/`)) {
  fail(`index.html does not reference assets through ${expectedBasePath}/_next/`);
}
if (expectedBasePath !== "" && /\b(?:href|src)=["']\/_next\//u.test(index)) {
  fail("index.html leaks a root-relative /_next asset outside the configured base path");
}

const files = (await filesBelow(outputRoot)).filter((path) => textExtensions.has(extname(path)));
const relativeFiles = new Set(
  files.map((path) => path.slice(outputRoot.length + 1).replaceAll("\\", "/")),
);
for (const path of files) {
  const value = await readFile(path, "utf8");
  if (
    /file:\/\/\/(?:[A-Z]:\/Users\/|Users\/|home\/)/iu.test(value) ||
    /(?:[A-Z]:\\Users\\|\/Users\/|\/home\/)/u.test(value)
  ) {
    fail(`${path.slice(outputRoot.length + 1)} contains a local absolute path`);
  }
}

function requireArtifact(path) {
  if (!relativeFiles.has(path)) fail(`required static artifact ${path} is missing`);
}

const humanCanonicalUrls = new Set();

async function verifiedHumanDocument(path, route) {
  requireArtifact(path);
  const html = await readFile(join(outputRoot, path), "utf8");
  const routeWithSlash = route === "/" ? "/" : `${route}/`;
  const canonical = `${expectedSiteOrigin}${routeWithSlash}`;
  for (const marker of [
    `<link rel="canonical" href="${canonical}"`,
    `<meta property="og:url" content="${canonical}"`,
    '<meta name="twitter:card" content="summary"',
  ]) {
    if (!html.includes(marker)) fail(`${path} omits metadata marker ${marker}`);
  }
  if (!/<title>[^<]+<\/title>/u.test(html)) fail(`${path} has no document title`);
  if (humanCanonicalUrls.has(canonical)) fail(`${path} duplicates canonical URL ${canonical}`);
  humanCanonicalUrls.add(canonical);

  if (expectedBasePath !== "") {
    for (const match of html.matchAll(/<a\b[^>]*\bhref="(\/[^"#]*)"/gu)) {
      if (
        match[1] !== expectedBasePath &&
        !match[1].startsWith(`${expectedBasePath}/`) &&
        !match[1].startsWith(`${expectedBasePath}?`)
      ) {
        fail(`${path} contains internal anchor outside base path: ${match[1]}`);
      }
    }
  }
}

function canonicalize(value) {
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

function digest(value) {
  return `sha256:${createHash("sha256")
    .update(JSON.stringify(canonicalize(value)))
    .digest("hex")}`;
}

async function verifiedMachineDocument(path, expected) {
  requireArtifact(path);
  const parsed = JSON.parse(await readFile(join(outputRoot, path), "utf8"));
  const { generatedDigest, ...content } = parsed;
  if (typeof generatedDigest !== "string" || generatedDigest !== digest(content)) {
    fail(`${path} has a missing or stale deterministic generatedDigest`);
  }
  if (parsed.schemaVersion !== 1 || parsed.contentVersion !== "unreleased") {
    fail(`${path} has an unsupported schema/content version`);
  }
  if (parsed.publicationStatus !== "blocked-unreleased") {
    fail(`${path} makes an invalid publication claim`);
  }
  if (
    typeof parsed.sourceCommit !== "string" ||
    parsed.sourceCommit.length === 0 ||
    typeof parsed.reviewNotice !== "string" ||
    !parsed.reviewNotice.includes("reviewed and tested")
  ) {
    fail(`${path} omits source identity or consumer review guidance`);
  }
  for (const [key, value] of Object.entries(expected)) {
    if (parsed[key] !== value) fail(`${path} has unexpected ${key}`);
  }
  return parsed;
}

function hasRequiredKeys(value, keys) {
  return (
    typeof value === "object" && value !== null && keys.every((key) => Object.hasOwn(value, key))
  );
}

function verifyStateLabUrl(path, item, url, expectedStory, expectedState = null) {
  if (url === null) {
    fail(`${path} omits an applicable exact State Lab URL`);
    return;
  }
  const parsed = new URL(url);
  if (
    `${parsed.origin}${parsed.pathname}` !== `${expectedSiteOrigin}${item.route}` ||
    parsed.hash !== "#state-lab" ||
    parsed.searchParams.get("labItem") !== item.id ||
    parsed.searchParams.get("labStory") !== expectedStory ||
    (expectedState === null
      ? parsed.searchParams.has("labState")
      : parsed.searchParams.get("labState") !== expectedState)
  ) {
    fail(`${path} has a non-exact ${expectedStory} State Lab URL for ${item.id}`);
  }
}

function verifiedItemMachineSections(path, parsed, item, contract) {
  const sections = {
    anatomy: [
      "status",
      "sourceKind",
      "sourcePath",
      "document",
      "evidenceStatus",
      "missingEvidenceLabel",
    ],
    stateApplicability: [
      "status",
      "sourcePath",
      "reason",
      "states",
      "evidenceStatus",
      "missingEvidenceLabel",
    ],
    accessibilityContract: [
      "status",
      "sourceStatus",
      "sourcePath",
      "contractVersion",
      "claim",
      "reason",
      "semantics",
      "keyboard",
      "evidenceRequirements",
      "recordedEvidence",
      "evidenceStatus",
      "missingEvidenceLabel",
    ],
    sourceAndEvidence: ["source", "contract", "evidence"],
    specimens: ["stateLab", "basic", "recommended", "states"],
    guidance: ["migration", "issues", "limitations"],
  };
  for (const [section, keys] of Object.entries(sections)) {
    if (!hasRequiredKeys(parsed[section], keys)) {
      fail(`${path} omits required nested ${section} fields`);
    }
  }
  if (
    parsed.anatomy?.status !== contract.anatomy.status ||
    JSON.stringify(parsed.anatomy?.document) !== JSON.stringify(contract.anatomy.document) ||
    parsed.stateApplicability?.status !== contract.stateApplicability.status ||
    parsed.stateApplicability?.states?.length !== contract.stateApplicability.states.length ||
    parsed.accessibilityContract?.status !== contract.semanticInteractionContract.status
  ) {
    fail(`${path} drifts from generated anatomy, state, or accessibility contracts`);
  }
  for (const section of [
    parsed.anatomy,
    parsed.stateApplicability,
    parsed.accessibilityContract,
    parsed.sourceAndEvidence?.evidence,
    parsed.guidance?.limitations,
  ]) {
    if (typeof section?.missingEvidenceLabel !== "string" || section.missingEvidenceLabel === "") {
      fail(`${path} hides a missing-evidence label`);
    }
  }
  if (
    parsed.sourceAndEvidence?.evidence?.releaseStatus !== "incomplete" ||
    parsed.guidance?.migration?.status !== "no-public-release-history" ||
    parsed.guidance?.limitations?.reviewStatus !== "not-release-reviewed"
  ) {
    fail(`${path} invents release, migration, or limitation review status`);
  }
  verifyStateLabUrl(path, item, parsed.specimens?.basic?.url, "basic");
  verifyStateLabUrl(path, item, parsed.specimens?.recommended?.url, "recommended");
  for (const state of parsed.specimens?.states ?? []) {
    if (state.applicability === "not-applicable") {
      if (state.url !== null) fail(`${path} links a state recorded as not applicable`);
    } else if (state.sourcePointer !== null) {
      verifyStateLabUrl(path, item, state.url, "state", state.id);
    }
  }
}

const passportVocabulary = [
  "Pass",
  "Pass with limitation",
  "Fail",
  "Not tested",
  "Not applicable",
  "Expired",
];
const passportSections = [
  "contract",
  "automation",
  "manual-assistive-technology",
  "keyboard-and-focus",
  "responsive-and-input",
  "locale-and-direction",
  "visual-modes",
  "compatibility",
  "footprint-and-dependencies",
  "semantic-sync",
  "known-limitations",
];

async function verifiedBlockedPassport(path, humanPath, item) {
  requireArtifact(path);
  const parsed = JSON.parse(await readFile(join(outputRoot, path), "utf8"));
  const { generatedDigest, ...content } = parsed;
  if (generatedDigest !== digest(content)) {
    fail(`${path} has a missing or stale deterministic generatedDigest`);
  }
  if (
    parsed.schemaVersion !== 1 ||
    parsed.artifactKind !== "quality-passport-skeleton-document" ||
    parsed.documentProfile !== "blocked-unreleased-preview-v1" ||
    parsed.publicationStatus !== "blocked-unreleased" ||
    parsed.publishable !== false ||
    parsed.skeleton !== true
  ) {
    fail(`${path} makes an unsupported Passport or publication claim`);
  }
  if (
    parsed.id !== item.id ||
    parsed.displayName !== item.displayName ||
    parsed.canonicalUrl !== `${expectedSiteOrigin}/quality/${item.id}` ||
    parsed.links?.machineJson !== `${expectedSiteOrigin}/m/v1/passports/${item.id}.json` ||
    parsed.links?.immutableJson !== null
  ) {
    fail(`${path} does not identify the matching human and machine routes`);
  }
  if (
    parsed.releaseIdentity?.release !== null ||
    parsed.releaseIdentity?.sourceDigest !== null ||
    parsed.releaseIdentity?.evidenceDigest !== null ||
    parsed.releaseIdentity?.evidenceGeneratedAt !== null ||
    (parsed.releaseIdentity?.sourceCommit !== null &&
      !/^[0-9a-f]{40}$/u.test(parsed.releaseIdentity.sourceCommit))
  ) {
    fail(`${path} invents or malforms an unavailable release identity`);
  }
  if (
    parsed.manualReview?.lastReviewed !== null ||
    parsed.manualReview?.nextReviewAt !== null ||
    parsed.manualReview?.status !== "not-yet-verified" ||
    parsed.overall?.releaseGateResult !== "Blocked" ||
    parsed.overall?.evidenceState !== "Not tested" ||
    parsed.overall?.aggregateState !== "Blocked"
  ) {
    fail(`${path} does not preserve the blocked and unreviewed result`);
  }
  if (
    JSON.stringify(parsed.evidenceVocabulary?.map(({ state }) => state)) !==
    JSON.stringify(passportVocabulary)
  ) {
    fail(`${path} omits or changes the defined Passport evidence vocabulary`);
  }
  if (JSON.stringify(parsed.sections?.map(({ id }) => id)) !== JSON.stringify(passportSections)) {
    fail(`${path} does not contain the exact eleven Passport evidence sections`);
  }
  for (const section of parsed.sections ?? []) {
    if (!Array.isArray(section.rows) || section.rows.length === 0) {
      fail(`${path} leaves ${section.id} without an explicit evidence row`);
      continue;
    }
    for (const row of section.rows) {
      if (
        row.state !== "Not tested" ||
        row.aggregateState !== "Unknown" ||
        !Array.isArray(row.evidenceReferences) ||
        row.evidenceReferences.length !== 0 ||
        typeof row.missingEvidenceExplanation !== "string" ||
        row.missingEvidenceExplanation.length === 0 ||
        !Array.isArray(row.details) ||
        row.details.length === 0
      ) {
        fail(`${path} turns missing ${section.id} evidence into an unsupported result`);
      }
    }
  }

  requireArtifact(humanPath);
  const human = await readFile(join(outputRoot, humanPath), "utf8");
  for (const marker of [
    `data-passport-digest="${generatedDigest}"`,
    `data-passport-id="${item.id}"`,
    'data-passport-overall="Blocked"',
    'data-passport-profile="blocked-unreleased-preview-v1"',
    'data-passport-publication-status="blocked-unreleased"',
    `data-passport-machine="${parsed.links.machineJson}"`,
  ]) {
    if (!human.includes(marker)) fail(`${humanPath} disagrees with ${path}: missing ${marker}`);
  }
  for (const section of passportSections) {
    if (!human.includes(`data-passport-section="${section}"`)) {
      fail(`${humanPath} omits machine section ${section}`);
    }
  }
  for (const state of passportVocabulary) {
    if (!human.includes(`data-passport-vocabulary-state="${state}"`)) {
      fail(`${humanPath} omits machine vocabulary state ${state}`);
    }
  }
}

for (const required of [
  "404.html",
  "community/index.html",
  "components/index.html",
  "docs/index.html",
  "kits/index.html",
  "llms-full.txt",
  "llms.txt",
  "m/v1/documentation-navigation.json",
  "m/v1/navigation.json",
  "m/v1/schemas/docs-page.schema.json",
  "m/v1/schemas/item-doc.schema.json",
  "m/v1/site.json",
  "manifest.webmanifest",
  "quality/index.html",
  "quality-lab/iframe.html",
  "quality-lab/index.html",
  "quality-lab/index.json",
  "releases/index.html",
  "roadmap/index.html",
  "robots.txt",
  "search-index.json",
  "sitemap.xml",
  "studio/index.html",
  "support/accessibility/index.html",
  "support/security/index.html",
  "support/index.html",
  "systems/index.html",
]) {
  requireArtifact(required);
}

const storybookIndex = JSON.parse(
  await readFile(join(outputRoot, "quality-lab/index.json"), "utf8"),
);
const storybookEntries = Object.values(storybookIndex.entries ?? {});
const implementationMatrix = JSON.parse(
  await readFile(resolve("registry/generated/implementation-matrix.v1.json"), "utf8"),
);
const documentationContractIndex = JSON.parse(
  await readFile(resolve("registry/generated/documentation-contract-index.v1.json"), "utf8"),
);
for (const item of implementationMatrix.items) {
  for (const mode of ["basic", "enhanced"]) {
    const story = item.storybook[mode];
    if (story.status !== "tested") continue;
    const importPath = `./${story.modulePath.replace(/^apps\/storybook\//u, "")}`;
    const resolved = storybookEntries.find(
      (entry) =>
        entry.type === "story" &&
        entry.importPath === importPath &&
        entry.exportName === story.exportName,
    );
    if (resolved === undefined) {
      fail(
        `quality-lab/index.json cannot resolve ${item.id} ${mode} specimen ${story.modulePath}#${story.exportName}`,
      );
    }
  }
}

if (expectedOriginPath !== expectedBasePath) {
  fail(
    `MERGORA_SITE_ORIGIN pathname ${expectedOriginPath} does not match MERGORA_BASE_PATH ${expectedBasePath}`,
  );
}

for (const [path, route] of [
  ["index.html", "/"],
  ["community/index.html", "/community"],
  ["community/registry/index.html", "/community/registry"],
  ["components/index.html", "/components"],
  ["docs/index.html", "/docs"],
  ["kits/index.html", "/kits"],
  ["quality/index.html", "/quality"],
  ["releases/index.html", "/releases"],
  ["releases/unreleased/index.html", "/releases/unreleased"],
  ["roadmap/index.html", "/roadmap"],
  ["studio/index.html", "/studio"],
  ["support/index.html", "/support"],
  ["support/accessibility/index.html", "/support/accessibility"],
  ["support/security/index.html", "/support/security"],
  ["systems/index.html", "/systems"],
]) {
  await verifiedHumanDocument(path, route);
}

const docsIndex = JSON.parse(await readFile(resolve("content/generated/docs-index.json"), "utf8"));
for (const item of docsIndex.items) {
  const human = `${item.route.slice(1)}/index.html`;
  const machineGroup = item.routeKind === "kit" ? "kits" : "items";
  await verifiedHumanDocument(human, item.route);
  await verifiedHumanDocument(`quality/${item.id}/index.html`, `/quality/${item.id}`);
  await verifiedBlockedPassport(
    `m/v1/passports/${item.id}.json`,
    `quality/${item.id}/index.html`,
    item,
  );
  const markdownPath = `m/v1/${machineGroup}/${item.id}.md`;
  requireArtifact(markdownPath);
  const markdown = await readFile(join(outputRoot, markdownPath), "utf8");
  for (const marker of [
    "## Generated anatomy",
    "## State applicability and exact State Lab links",
    "## Keyboard and accessibility contract",
    "## Source, contract, and evidence status",
    "## Migration, issues, and limitations",
  ]) {
    if (!markdown.includes(marker)) fail(`${markdownPath} omits ${marker}`);
  }
  const machinePath = `m/v1/${machineGroup}/${item.id}.json`;
  const parsed = await verifiedMachineDocument(machinePath, {
    id: item.id,
    canonicalUrl: `${expectedSiteOrigin}${item.route}`,
  });
  const contract = documentationContractIndex.items.find(({ id }) => id === item.id);
  if (contract === undefined) {
    fail(`${machinePath} has no generated documentation contract`);
  } else {
    verifiedItemMachineSections(machinePath, parsed, item, contract);
  }
  const humanDocument = await readFile(join(outputRoot, human), "utf8");
  for (const marker of [
    '"@type":"SoftwareSourceCode"',
    '"@type":"TechArticle"',
    '"@type":"BreadcrumbList"',
    "https://github.com/AkhilTrivediX/mergora",
  ]) {
    if (!humanDocument.includes(marker)) fail(`${human} omits structured-data marker ${marker}`);
  }
  if (/"softwareVersion"|"version"\s*:\s*"(?:stable|\d+\.\d+\.\d+)"/iu.test(humanDocument)) {
    fail(`${human} invents a structured-data release or Stable version`);
  }
}

for (const slug of [
  "accessibility",
  "cli",
  "configuration",
  "contracts",
  "installation",
  "mcp-and-agents",
  "migrations",
  "quick-start",
  "registry",
  "responsive-and-i18n",
  "semantic-sync",
  "theming",
]) {
  const humanPath = `docs/${slug}/index.html`;
  await verifiedHumanDocument(humanPath, `/docs/${slug}`);
  const humanDocument = await readFile(join(outputRoot, humanPath), "utf8");
  for (const marker of [
    '"@type":"SoftwareSourceCode"',
    '"@type":"TechArticle"',
    '"@type":"BreadcrumbList"',
  ]) {
    if (!humanDocument.includes(marker)) fail(`${humanPath} omits ${marker}`);
  }
  requireArtifact(`m/v1/docs/${slug}.md`);
  const parsed = await verifiedMachineDocument(`m/v1/docs/${slug}.json`, {
    id: slug,
    canonicalUrl: `${expectedSiteOrigin}/docs/${slug}`,
  });
  if (
    !Array.isArray(parsed.sections) ||
    parsed.sections.some(
      (section) =>
        !hasRequiredKeys(section, ["id", "heading", "paragraphs", "command"]) ||
        section.paragraphs.length === 0,
    ) ||
    !hasRequiredKeys(parsed.navigation, ["global", "documentation", "previous", "next", "footer"])
  ) {
    fail(`m/v1/docs/${slug}.json omits strict section or navigation parity`);
  }
}

await verifiedMachineDocument("m/v1/releases/unreleased.json", {
  version: "unreleased",
  canonicalUrl: `${expectedSiteOrigin}/releases/unreleased`,
});

for (const path of ["m/v1/navigation.json", "m/v1/site.json"]) {
  const parsed = JSON.parse(await readFile(join(outputRoot, path), "utf8"));
  const { generatedDigest, ...content } = parsed;
  if (generatedDigest !== digest(content)) fail(`${path} has a stale deterministic digest`);
  if (
    parsed.sourceCommit === undefined ||
    parsed.canonicalUrl !== `${expectedSiteOrigin}/${path}`
  ) {
    fail(`${path} omits canonical source identity`);
  }
}

const documentationNavigation = JSON.parse(
  await readFile(join(outputRoot, "m/v1/documentation-navigation.json"), "utf8"),
);
const { generatedDigest: documentationNavigationDigest, ...documentationNavigationContent } =
  documentationNavigation;
if (
  documentationNavigationDigest !== digest(documentationNavigationContent) ||
  documentationNavigation.publicationStatus !== "blocked-unreleased" ||
  documentationNavigation.catalogAuthority !== `${expectedSiteOrigin}/m/v1/navigation.json` ||
  documentationNavigation.documentation?.length !== 12 ||
  documentationNavigation.global?.length !== 5 ||
  documentationNavigation.footer?.length !== 4 ||
  documentationNavigation.catalogSequences?.length !== 3
) {
  fail("m/v1/documentation-navigation.json is stale or omits deterministic navigation layers");
}
for (const sequence of documentationNavigation.documentation ?? []) {
  if (!hasRequiredKeys(sequence, ["id", "title", "url", "previous", "next"])) {
    fail("m/v1/documentation-navigation.json omits documentation previous/next fields");
  }
}

for (const [path, requiredTopLevel, requiredNested] of [
  [
    "m/v1/schemas/item-doc.schema.json",
    [
      "anatomy",
      "stateApplicability",
      "accessibilityContract",
      "sourceAndEvidence",
      "specimens",
      "guidance",
    ],
    {
      anatomy: ["document", "evidenceStatus", "missingEvidenceLabel"],
      stateApplicability: ["states", "evidenceStatus", "missingEvidenceLabel"],
      accessibilityContract: [
        "keyboard",
        "evidenceRequirements",
        "evidenceStatus",
        "missingEvidenceLabel",
      ],
      sourceAndEvidence: ["source", "contract", "evidence"],
      specimens: ["stateLab", "basic", "recommended", "states"],
      guidance: ["migration", "issues", "limitations"],
    },
  ],
  [
    "m/v1/schemas/docs-page.schema.json",
    ["sections", "navigation", "related"],
    {
      navigation: ["global", "documentation", "previous", "next", "footer"],
      related: ["documentationIndex", "quality", "machineJson", "machineMarkdown"],
    },
  ],
]) {
  const schema = JSON.parse(await readFile(join(outputRoot, path), "utf8"));
  for (const key of requiredTopLevel) {
    if (!schema.required?.includes(key)) fail(`${path} does not require ${key}`);
  }
  for (const [key, required] of Object.entries(requiredNested)) {
    for (const nestedKey of required) {
      if (!schema.properties?.[key]?.required?.includes(nestedKey)) {
        fail(`${path} does not reject missing ${key}.${nestedKey}`);
      }
    }
  }
}

const fullCorpus = await readFile(join(outputRoot, "llms-full.txt"), "utf8");
if (
  fullCorpus.length < 500_000 ||
  !fullCorpus.includes("## Generated anatomy") ||
  !fullCorpus.includes("## Keyboard and accessibility contract") ||
  docsIndex.items.some((item) => !fullCorpus.includes(`# ${item.displayName}\n`))
) {
  fail("llms-full.txt contains summaries instead of the full contract-backed item corpus");
}

const robots = await readFile(join(outputRoot, "robots.txt"), "utf8");
for (const disallowed of [
  `${expectedBasePath}/m/`,
  `${expectedBasePath}/r/`,
  `${expectedBasePath}/quality-lab/`,
  `${expectedBasePath}/search-index.json`,
  `${expectedBasePath}/*?*`,
]) {
  if (!robots.includes(`Disallow: ${disallowed}`)) {
    fail(`robots.txt omits payload/query/preview policy for ${disallowed}`);
  }
}

const sitemap = await readFile(join(outputRoot, "sitemap.xml"), "utf8");
const sitemapUrls = extractSitemapUrls(sitemap);
for (const url of [
  `${expectedSiteOrigin}/components`,
  `${expectedSiteOrigin}/docs/quick-start`,
  `${expectedSiteOrigin}/quality`,
  `${expectedSiteOrigin}/studio`,
  ...docsIndex.items.map((item) => `${expectedSiteOrigin}${item.route}`),
  ...[
    "accessibility",
    "cli",
    "configuration",
    "contracts",
    "installation",
    "mcp-and-agents",
    "migrations",
    "quick-start",
    "registry",
    "responsive-and-i18n",
    "semantic-sync",
    "theming",
  ].map((slug) => `${expectedSiteOrigin}/docs/${slug}`),
]) {
  if (!sitemapUrls.includes(url)) fail(`sitemap.xml omits ${url}`);
}
if (sitemapUrls.some((url) => isExcludedSitemapUrl(url, expectedSiteOrigin))) {
  fail("sitemap.xml includes a machine payload or query/preview URL");
}

const webManifest = JSON.parse(await readFile(join(outputRoot, "manifest.webmanifest"), "utf8"));
if (
  webManifest.name !== "Mergora" ||
  webManifest.start_url !== `${expectedBasePath}/` ||
  webManifest.scope !== `${expectedBasePath}/` ||
  Object.hasOwn(webManifest, "version") ||
  !String(webManifest.description).toLocaleLowerCase("en-US").includes("unreleased")
) {
  fail("manifest.webmanifest omits scope or invents a release/version claim");
}

if (!process.exitCode) {
  process.stdout.write(
    `static export verification passed: ${files.length} text artifacts use base path ${expectedBasePath}\n`,
  );
}
