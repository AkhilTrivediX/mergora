import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const workspaceRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const matrixPath = resolve(workspaceRoot, "registry/generated/implementation-matrix.v1.json");
const catalogPath = resolve(workspaceRoot, "registry/generated/catalog.json");

const windowsDesktop = {
  os: "Windows",
  browser: "Edge",
  assistiveTechnology: null,
  input: "keyboard",
  locale: "en-US",
  direction: "ltr",
  viewport: { width: 1280, height: 800 },
  zoomPercent: 100,
  theme: "light",
  motion: "no-preference",
};

const macDesktop = {
  os: "macOS",
  browser: "Safari",
  assistiveTechnology: null,
  input: "keyboard",
  locale: "en-US",
  direction: "ltr",
  viewport: { width: 1440, height: 900 },
  zoomPercent: 100,
  theme: "light",
  motion: "no-preference",
};

function claim(coverageId, minimumRiskClass) {
  return { coverageId, minimumRiskClass };
}

export const MANUAL_EVIDENCE_CAMPAIGN_LANES = [
  {
    id: "windows-keyboard-edge",
    title: "Windows keyboard-only visual path",
    claims: [claim("keyboard-manual-visual", 1)],
    environment: windowsDesktop,
  },
  {
    id: "windows-nvda-firefox",
    title: "Windows NVDA and Firefox primary semantic path",
    claims: [claim("desktop-screen-reader-semantic-engine-a", 1), claim("task-workflow", 3)],
    environment: {
      ...windowsDesktop,
      browser: "Firefox",
      assistiveTechnology: "NVDA",
    },
  },
  {
    id: "macos-current-voiceover-safari",
    title: "Current macOS VoiceOver and Safari semantic path",
    versionSlot: "current",
    claims: [claim("desktop-screen-reader-semantic-engine-b", 1)],
    environment: { ...macDesktop, assistiveTechnology: "VoiceOver" },
  },
  {
    id: "macos-previous-voiceover-safari",
    title: "Previous macOS VoiceOver and Safari semantic path",
    versionSlot: "previous",
    claims: [claim("desktop-screen-reader-semantic-engine-b", 1)],
    environment: {
      ...macDesktop,
      viewport: { width: 1280, height: 800 },
      assistiveTechnology: "VoiceOver",
    },
  },
  {
    id: "windows-nvda-chrome",
    title: "Windows NVDA and Chrome comparison path",
    claims: [claim("desktop-at-full", 2), claim("interruption-recovery", 3)],
    environment: { ...windowsDesktop, browser: "Chrome", assistiveTechnology: "NVDA" },
  },
  {
    id: "windows-jaws-current-edge",
    title: "Windows current JAWS and Edge enterprise path",
    versionSlot: "current",
    claims: [claim("desktop-at-full", 2), claim("performance-scale", 3)],
    environment: { ...windowsDesktop, assistiveTechnology: "JAWS" },
  },
  {
    id: "windows-jaws-previous-edge",
    title: "Windows previous JAWS and Edge enterprise path",
    versionSlot: "previous",
    claims: [claim("desktop-at-full", 2)],
    environment: { ...windowsDesktop, assistiveTechnology: "JAWS" },
  },
  {
    id: "windows-high-contrast-edge",
    title: "Windows High Contrast keyboard path",
    claims: [claim("forced-colors", 2)],
    environment: { ...windowsDesktop, theme: "forced-colors" },
  },
  {
    id: "windows-voice-access-edge",
    title: "Windows Voice Access and Edge path",
    claims: [claim("desktop-at-full", 2), claim("voice-control", 3)],
    environment: {
      ...windowsDesktop,
      assistiveTechnology: "Voice Access",
      input: "voice",
    },
  },
  {
    id: "macos-full-keyboard-access-safari",
    title: "macOS Full Keyboard Access and Safari path",
    claims: [claim("desktop-at-full", 2)],
    environment: { ...macDesktop, assistiveTechnology: "Full Keyboard Access" },
  },
  {
    id: "macos-voice-control-safari",
    title: "macOS Voice Control and Safari path",
    claims: [claim("desktop-at-full", 2), claim("voice-control", 3)],
    environment: {
      ...macDesktop,
      assistiveTechnology: "Voice Control",
      input: "voice",
    },
  },
  {
    id: "ios-current-voiceover-safari-touch",
    title: "Current iOS VoiceOver touch path",
    versionSlot: "current",
    claims: [claim("touch-screen-reader-where-applicable", 2), claim("mobile-at-full", 3)],
    environment: {
      os: "iOS",
      browser: "Safari",
      assistiveTechnology: "VoiceOver",
      input: "touch",
      locale: "en-US",
      direction: "ltr",
      viewport: { width: 390, height: 844 },
      zoomPercent: 100,
      theme: "light",
      motion: "no-preference",
    },
  },
  {
    id: "ios-previous-voiceover-safari-touch",
    title: "Previous iOS VoiceOver touch path",
    versionSlot: "previous",
    claims: [claim("touch-screen-reader-where-applicable", 2), claim("mobile-at-full", 3)],
    environment: {
      os: "iOS",
      browser: "Safari",
      assistiveTechnology: "VoiceOver",
      input: "touch",
      locale: "en-US",
      direction: "ltr",
      viewport: { width: 390, height: 844 },
      zoomPercent: 100,
      theme: "light",
      motion: "no-preference",
    },
  },
  {
    id: "ipados-current-voiceover-safari-touch",
    title: "Current iPadOS VoiceOver touch path",
    versionSlot: "current",
    claims: [claim("touch-screen-reader-where-applicable", 2), claim("mobile-at-full", 3)],
    environment: {
      os: "iPadOS",
      browser: "Safari",
      assistiveTechnology: "VoiceOver",
      input: "touch",
      locale: "en-US",
      direction: "ltr",
      viewport: { width: 768, height: 1024 },
      zoomPercent: 100,
      theme: "light",
      motion: "no-preference",
    },
  },
  {
    id: "ipados-previous-voiceover-safari-touch",
    title: "Previous iPadOS VoiceOver touch path",
    versionSlot: "previous",
    claims: [claim("touch-screen-reader-where-applicable", 2), claim("mobile-at-full", 3)],
    environment: {
      os: "iPadOS",
      browser: "Safari",
      assistiveTechnology: "VoiceOver",
      input: "touch",
      locale: "en-US",
      direction: "ltr",
      viewport: { width: 768, height: 1024 },
      zoomPercent: 100,
      theme: "light",
      motion: "no-preference",
    },
  },
  {
    id: "ipados-current-voiceover-safari-keyboard",
    title: "Current iPadOS VoiceOver external-keyboard path",
    claims: [claim("touch-screen-reader-where-applicable", 2), claim("mobile-at-full", 3)],
    environment: {
      os: "iPadOS",
      browser: "Safari",
      assistiveTechnology: "VoiceOver",
      input: "keyboard",
      locale: "en-US",
      direction: "ltr",
      viewport: { width: 1024, height: 768 },
      zoomPercent: 100,
      theme: "light",
      motion: "no-preference",
    },
  },
  {
    id: "android-current-talkback-chrome-touch",
    title: "Current Android TalkBack touch path",
    versionSlot: "current",
    claims: [claim("touch-screen-reader-where-applicable", 2), claim("mobile-at-full", 3)],
    environment: {
      os: "Android",
      browser: "Chrome",
      assistiveTechnology: "TalkBack",
      input: "touch",
      locale: "en-US",
      direction: "ltr",
      viewport: { width: 360, height: 800 },
      zoomPercent: 100,
      theme: "light",
      motion: "no-preference",
    },
  },
  {
    id: "android-previous-talkback-chrome-touch",
    title: "Previous Android TalkBack touch path",
    versionSlot: "previous",
    claims: [claim("touch-screen-reader-where-applicable", 2), claim("mobile-at-full", 3)],
    environment: {
      os: "Android",
      browser: "Chrome",
      assistiveTechnology: "TalkBack",
      input: "touch",
      locale: "en-US",
      direction: "ltr",
      viewport: { width: 360, height: 800 },
      zoomPercent: 100,
      theme: "light",
      motion: "no-preference",
    },
  },
  {
    id: "android-current-talkback-chrome-keyboard",
    title: "Current Android TalkBack external-keyboard path",
    claims: [claim("touch-screen-reader-where-applicable", 2), claim("mobile-at-full", 3)],
    environment: {
      os: "Android",
      browser: "Chrome",
      assistiveTechnology: "TalkBack",
      input: "keyboard",
      locale: "en-US",
      direction: "ltr",
      viewport: { width: 390, height: 844 },
      zoomPercent: 100,
      theme: "light",
      motion: "no-preference",
    },
  },
  {
    id: "windows-zoom-firefox",
    title: "Windows Firefox 400 percent zoom and reflow path",
    claims: [claim("zoom-reflow", 2)],
    environment: {
      ...windowsDesktop,
      browser: "Firefox",
      zoomPercent: 400,
    },
  },
  {
    id: "windows-nvda-firefox-rtl",
    title: "Windows NVDA and Firefox RTL path",
    claims: [claim("rtl", 2)],
    environment: {
      ...windowsDesktop,
      browser: "Firefox",
      assistiveTechnology: "NVDA",
      locale: "ar-EG",
      direction: "rtl",
    },
  },
  {
    id: "windows-nvda-chrome-focus-restoration",
    title: "Windows NVDA and Chrome focus-restoration path",
    claims: [claim("focus-restoration", 2)],
    environment: { ...windowsDesktop, browser: "Chrome", assistiveTechnology: "NVDA" },
  },
  {
    id: "ios-switch-control-safari",
    title: "iOS Switch Control workflow path",
    claims: [claim("switch-control", 3)],
    environment: {
      os: "iOS",
      browser: "Safari",
      assistiveTechnology: "Switch Control",
      input: "switch",
      locale: "en-US",
      direction: "ltr",
      viewport: { width: 390, height: 844 },
      zoomPercent: 100,
      theme: "light",
      motion: "no-preference",
    },
  },
  {
    id: "ipados-switch-control-safari",
    title: "iPadOS Switch Control workflow path",
    claims: [claim("switch-control", 3)],
    environment: {
      os: "iPadOS",
      browser: "Safari",
      assistiveTechnology: "Switch Control",
      input: "switch",
      locale: "en-US",
      direction: "ltr",
      viewport: { width: 768, height: 1024 },
      zoomPercent: 100,
      theme: "light",
      motion: "no-preference",
    },
  },
  {
    id: "android-switch-access-chrome",
    title: "Android Switch Access workflow path",
    claims: [claim("switch-control", 3)],
    environment: {
      os: "Android",
      browser: "Chrome",
      assistiveTechnology: "Switch Access",
      input: "switch",
      locale: "en-US",
      direction: "ltr",
      viewport: { width: 360, height: 800 },
      zoomPercent: 100,
      theme: "light",
      motion: "no-preference",
    },
  },
];

const TASKS_BY_COVERAGE = {
  "keyboard-manual-visual": {
    instruction: "Navigate, operate, cancel, and exit using only the keyboard.",
    expected: "Every action is reachable, focus remains visible, and focus order is logical.",
  },
  "desktop-screen-reader-semantic-engine-a": {
    instruction: "Read and operate the primary task with the semantic-engine A screen-reader lane.",
    expected: "Role, name, state, value, relationships, and changes are announced accurately.",
  },
  "desktop-screen-reader-semantic-engine-b": {
    instruction: "Read and operate the primary task with the semantic-engine B screen-reader lane.",
    expected: "Role, name, state, value, relationships, and changes are announced accurately.",
  },
  "desktop-at-full": {
    instruction: "Complete entry, navigation, operation, recovery, cancellation, and exit tasks.",
    expected:
      "The complete desktop assistive-technology workflow remains operable and understandable.",
  },
  "touch-screen-reader-where-applicable": {
    instruction:
      "Complete the responsive task using touch exploration or the specified external input.",
    expected:
      "Applicable controls are discoverable, operable, and announced without gesture-only traps.",
  },
  "forced-colors": {
    instruction: "Operate every state in the specified forced-colors environment.",
    expected: "Focus, boundaries, selected state, validation, and status remain distinguishable.",
  },
  "zoom-reflow": {
    instruction:
      "Complete the primary task at the specified zoom without horizontal page scrolling.",
    expected: "Content reflows, actions remain available, and focused content is not obscured.",
  },
  rtl: {
    instruction: "Complete the primary task in the specified RTL locale and direction.",
    expected: "Order, navigation, portals, text direction, and announcements remain correct.",
  },
  "focus-restoration": {
    instruction: "Open, complete or cancel, dismiss, and reopen every applicable focus boundary.",
    expected: "Initial focus and restoration follow the component contract without focus loss.",
  },
  "mobile-at-full": {
    instruction: "Complete the full mobile assistive-technology task including error recovery.",
    expected: "The complete workflow remains discoverable, operable, and correctly announced.",
  },
  "voice-control": {
    instruction:
      "Invoke visible controls by their visible labels and complete the primary task by voice.",
    expected:
      "Label-in-name is preserved and duplicate labels remain deterministically addressable.",
  },
  "switch-control": {
    instruction: "Scan to, operate, recover, and exit the primary task using switch access.",
    expected: "Scan order is logical and excludes decorative or duplicate stops.",
  },
  "task-workflow": {
    instruction: "Complete the end-to-end domain-neutral workflow from entry through confirmation.",
    expected: "State, context, progress, errors, and completion remain coherent throughout.",
  },
  "interruption-recovery": {
    instruction: "Interrupt the task at each durable state and resume or recover it.",
    expected: "No data, focus target, status, or accessible context is silently lost.",
  },
  "performance-scale": {
    instruction: "Complete the primary task with the plan-defined maximum representative data set.",
    expected:
      "Interaction, announcements, focus, and navigation stay responsive and deterministic.",
  },
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function git(...args) {
  const result = spawnSync("git", args, {
    cwd: workspaceRoot,
    encoding: "utf8",
    shell: false,
    windowsHide: true,
  });
  if (result.error !== undefined) throw result.error;
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${(result.stderr || result.stdout).trim()}`);
  }
  return result.stdout.trim();
}

function catalogRiskClasses() {
  const catalog = JSON.parse(readFileSync(catalogPath, "utf8"));
  assert(catalog !== null && typeof catalog === "object", "Generated catalog must be an object.");
  assert(Array.isArray(catalog.items), "Generated catalog items must be an array.");
  return new Map(
    catalog.items.map((item) => {
      assert(item !== null && typeof item === "object", "Generated catalog item is invalid.");
      assert(
        typeof item.id === "string" && item.id !== "",
        "Generated catalog item id is missing.",
      );
      assert(
        item.riskClass === 1 || item.riskClass === 2 || item.riskClass === 3,
        `Generated catalog item ${item.id} has no valid risk class.`,
      );
      return [item.id, item.riskClass];
    }),
  );
}

function plannedSession(lane, riskClass) {
  const claims = lane.claims
    .filter((entry) => entry.minimumRiskClass <= riskClass)
    .sort(
      (left, right) =>
        left.coverageId.localeCompare(right.coverageId, "en-US") ||
        left.minimumRiskClass - right.minimumRiskClass,
    );
  if (claims.length === 0) return null;
  return {
    laneId: lane.id,
    title: lane.title,
    status: "not-run",
    recordId: null,
    tester: null,
    reviewer: null,
    performedAt: null,
    expiresAt: null,
    binding: {
      sourceDigest: null,
      behaviorDependencyDigest: null,
      browserPolicyDigest: null,
      contractVersion: null,
    },
    environment: {
      laneId: lane.id,
      versionSlot: lane.versionSlot ?? null,
      os: lane.environment.os,
      osVersion: null,
      browser: lane.environment.browser,
      browserVersion: null,
      assistiveTechnology:
        lane.environment.assistiveTechnology === null
          ? null
          : { name: lane.environment.assistiveTechnology, version: null },
      input: lane.environment.input,
      locale: lane.environment.locale,
      direction: lane.environment.direction,
      viewport: lane.environment.viewport,
      zoomPercent: lane.environment.zoomPercent,
      theme: lane.environment.theme,
      motion: lane.environment.motion,
    },
    coverage: claims.map(({ coverageId }) => ({
      coverageId,
      outcome: null,
      rationale: null,
    })),
    tasks: claims.map(({ coverageId }) => ({
      id: coverageId,
      instruction: TASKS_BY_COVERAGE[coverageId].instruction,
      expected: TASKS_BY_COVERAGE[coverageId].expected,
      observed: null,
      outcome: null,
      status: "not-run",
    })),
    artifactReferences: [],
    overallOutcome: null,
  };
}

export function createManualEvidencePreparation(matrix, commit, workingTreeState) {
  assert(matrix !== null && typeof matrix === "object", "Implementation matrix must be an object.");
  assert(Array.isArray(matrix.items), "Implementation matrix items must be an array.");
  assert(/^[0-9a-f]{40}$/u.test(commit), "Manual preparation requires a full Git commit SHA.");
  assert(
    workingTreeState === "clean" || workingTreeState === "dirty",
    "Working-tree state must be clean or dirty.",
  );

  const riskClasses = catalogRiskClasses();
  const seen = new Set();
  const items = matrix.items
    .map((item) => {
      assert(item !== null && typeof item === "object", "Implementation matrix item is invalid.");
      assert(
        typeof item.id === "string" && item.id !== "",
        "Implementation matrix item id is missing.",
      );
      assert(
        typeof item.displayName === "string" && item.displayName !== "",
        `Implementation matrix item ${item.id} has no display name.`,
      );
      assert(
        typeof item.family === "string" && item.family !== "",
        `Implementation matrix item ${item.id} has no family.`,
      );
      assert(!seen.has(item.id), `Implementation matrix item ${item.id} is duplicated.`);
      seen.add(item.id);
      const riskClass = riskClasses.get(item.id);
      assert(
        riskClass !== undefined,
        `Implementation matrix item ${item.id} is absent from catalog.`,
      );
      const sessions = MANUAL_EVIDENCE_CAMPAIGN_LANES.map((lane) => plannedSession(lane, riskClass))
        .filter((session) => session !== null)
        .sort((left, right) => left.laneId.localeCompare(right.laneId, "en-US"));
      return {
        id: item.id,
        displayName: item.displayName,
        family: item.family,
        layer: item.layer,
        targetMaturity: item.maturity?.target ?? "unclassified",
        riskClass,
        status: "not-run",
        reviewer: null,
        environmentRecord: null,
        taskRecord: null,
        artifactReferences: [],
        requiredCoverage: [
          ...new Set(
            sessions.flatMap((session) => session.coverage.map((entry) => entry.coverageId)),
          ),
        ].sort((left, right) => left.localeCompare(right, "en-US")),
        sessions,
      };
    })
    .sort((left, right) => left.id.localeCompare(right.id, "en-US"));

  return {
    schemaVersion: 1,
    artifactKind: "manual-evidence-preparation",
    commit,
    workingTreeState,
    evidenceStatus: "not-run",
    evidenceClaim: "none",
    instructions: [
      "This preparation is NOT RUN and cannot be used as evidence.",
      "Record exact numeric OS, browser, and assistive-technology versions in every required lane.",
      "Do not change a lane's OS, browser, assistive technology, input, locale, direction, viewport, zoom, theme, or motion settings; use a separately approved policy lane instead.",
      "Bind every completed record to the candidate source, behavior-dependency, browser-policy, and contract digests and attach immutable digested artifacts.",
      "Risk Class 3 records require a tester and a different independent reviewer.",
    ],
    items,
  };
}

export function renderManualEvidenceChecklist(preparation) {
  const families = new Map();
  for (const item of preparation.items) {
    const familyItems = families.get(item.family) ?? [];
    familyItems.push(item);
    families.set(item.family, familyItems);
  }

  const sessionCount = preparation.items.reduce((sum, item) => sum + item.sessions.length, 0);
  const taskCount = preparation.items.reduce(
    (sum, item) =>
      sum + item.sessions.reduce((itemSum, session) => itemSum + session.tasks.length, 0),
    0,
  );

  return [
    "# Manual accessibility and real-device evidence preparation",
    "",
    "> Status: **NOT RUN**. This workspace is a blank campaign plan and contains no pass, conformance, maturity, or release claim.",
    "",
    `- Source commit: \`${preparation.commit}\``,
    `- Working tree when prepared: ${preparation.workingTreeState}`,
    `- Inventory items: ${String(preparation.items.length)}`,
    `- Planned environment sessions: ${String(sessionCount)}`,
    `- Planned task observations: ${String(taskCount)}`,
    "- Testers and reviewers: _not assigned_",
    "- Evidence artifacts and candidate digests: _none_",
    "",
    "## Session prerequisites",
    "",
    "- [ ] Use the exact named lane; fill exact numeric versions without substituting another OS, browser, AT, input, locale, direction, theme, or zoom setting.",
    "- [ ] Confirm source, behavior-dependency, browser-policy, and contract digests match the candidate.",
    "- [ ] Record observed behavior and a Pass, Fail, or permitted Not applicable result for every claim.",
    "- [ ] Attach immutable artifact references and digests; a missing or invalid artifact invalidates the record.",
    "- [ ] Obtain an independent reviewer for every Risk Class 3 record.",
    "",
    ...[...families.entries()].flatMap(([family, items]) => [
      `## ${family}`,
      "",
      ...items.flatMap((item) => [
        `### ${item.displayName} (\`${item.id}\`)`,
        "",
        `Risk Class ${String(item.riskClass)} — **NOT RUN**. ${String(item.sessions.length)} exact environment sessions are required.`,
        "",
        ...item.sessions.flatMap((session) => {
          const environment = session.environment;
          const assistiveTechnology =
            environment.assistiveTechnology === null
              ? "none"
              : `${environment.assistiveTechnology.name} (exact version not recorded)`;
          return [
            `- [ ] \`${session.laneId}\`: ${session.title} — **NOT RUN**`,
            `  - Environment: ${environment.os} (exact version not recorded); ${environment.browser} (exact version not recorded); AT ${assistiveTechnology}; ${environment.input}; ${environment.locale}/${environment.direction}; ${String(environment.viewport.width)}x${String(environment.viewport.height)}; ${String(environment.zoomPercent)}% zoom; ${environment.theme}; motion ${environment.motion}.`,
            `  - Coverage: ${session.coverage.map((entry) => `\`${entry.coverageId}\``).join(", ")}.`,
            ...session.tasks.map(
              (task) =>
                `  - [ ] Task \`${task.id}\`: ${task.instruction} Expected: ${task.expected}`,
            ),
            "  - Observations, outcome, tester, reviewer, candidate digests, and artifacts: _blank_",
          ];
        }),
        "",
      ]),
    ]),
  ].join("\n");
}

function parseArguments(arguments_) {
  if (arguments_.length === 0) return { planOnly: false };
  if (arguments_.length === 1 && arguments_[0] === "--plan") return { planOnly: true };
  throw new Error("Usage: node scripts/prepare-manual-evidence.mjs [--plan]");
}

function run() {
  const { planOnly } = parseArguments(process.argv.slice(2));
  const matrix = JSON.parse(readFileSync(matrixPath, "utf8"));
  const commit = git("rev-parse", "HEAD");
  const workingTreeState =
    git("status", "--porcelain=v1", "--untracked-files=all") === "" ? "clean" : "dirty";
  const preparation = createManualEvidencePreparation(matrix, commit, workingTreeState);
  const relativeDirectory = `artifacts/manual-evidence-preparation/${commit}`;

  if (planOnly) {
    const sessionCount = preparation.items.reduce((sum, item) => sum + item.sessions.length, 0);
    const taskCount = preparation.items.reduce(
      (sum, item) =>
        sum + item.sessions.reduce((itemSum, session) => itemSum + session.tasks.length, 0),
      0,
    );
    process.stdout.write(
      `${JSON.stringify(
        {
          schemaVersion: 1,
          operation: "prepare-manual-evidence",
          outputDirectory: relativeDirectory,
          itemCount: preparation.items.length,
          sessionCount,
          taskCount,
          evidenceStatus: preparation.evidenceStatus,
          evidenceClaim: preparation.evidenceClaim,
          writesFiles: false,
        },
        null,
        2,
      )}\n`,
    );
    return;
  }

  const directory = resolve(workspaceRoot, relativeDirectory);
  mkdirSync(directory, { recursive: true });
  writeFileSync(
    resolve(directory, "workspace.json"),
    `${JSON.stringify(preparation, null, 2)}\n`,
    "utf8",
  );
  writeFileSync(
    resolve(directory, "CHECKLIST.md"),
    `${renderManualEvidenceChecklist(preparation)}\n`,
    "utf8",
  );
  process.stdout.write(
    `Manual evidence workspace prepared at ${relativeDirectory}. Status is NOT RUN; no evidence pass or conformance claim was created.\n`,
  );
}

const isMain =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    run();
  } catch (error) {
    const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
    process.stderr.write(`manual evidence preparation failed: ${message}\n`);
    process.exitCode = 1;
  }
}
