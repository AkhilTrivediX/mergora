import type { Direction, MotionPreference, Theme } from "./environment.js";
import { compareText } from "./validation.js";

export type RiskClass = 1 | 2 | 3;

export const MANUAL_COVERAGE_IDS = [
  "keyboard-manual-visual",
  "desktop-screen-reader-semantic-engine-a",
  "desktop-screen-reader-semantic-engine-b",
  "desktop-at-full",
  "touch-screen-reader-where-applicable",
  "forced-colors",
  "zoom-reflow",
  "rtl",
  "focus-restoration",
  "mobile-at-full",
  "voice-control",
  "switch-control",
  "task-workflow",
  "interruption-recovery",
  "performance-scale",
] as const;
export type ManualCoverageId = (typeof MANUAL_COVERAGE_IDS)[number];

export type ManualInput = "keyboard" | "pointer" | "touch" | "switch" | "voice";

export interface ManualEvidenceLaneEnvironment {
  readonly os: "Windows" | "macOS" | "iOS" | "iPadOS" | "Android";
  readonly browser: "Firefox" | "Chrome" | "Edge" | "Safari";
  readonly assistiveTechnology:
    | "NVDA"
    | "JAWS"
    | "VoiceOver"
    | "Full Keyboard Access"
    | "Voice Access"
    | "Voice Control"
    | "TalkBack"
    | "Switch Control"
    | "Switch Access"
    | null;
  readonly input: ManualInput;
  readonly locale: string;
  readonly direction: Direction;
  readonly viewport: { readonly width: number; readonly height: number };
  readonly zoomPercent: number;
  readonly theme: Theme;
  readonly motion: MotionPreference;
}

export interface ManualEvidenceLane {
  readonly id: string;
  readonly title: string;
  readonly minimumRiskClass: RiskClass;
  readonly versionSlot?: "current" | "previous";
  readonly allowedCoverage: readonly ManualCoverageId[];
  readonly environment: ManualEvidenceLaneEnvironment;
}

const windowsDesktop = {
  os: "Windows",
  input: "keyboard",
  locale: "en-US",
  direction: "ltr",
  viewport: { width: 1280, height: 800 },
  zoomPercent: 100,
  theme: "light",
  motion: "no-preference",
} as const;

const macDesktop = {
  os: "macOS",
  browser: "Safari",
  input: "keyboard",
  locale: "en-US",
  direction: "ltr",
  viewport: { width: 1440, height: 900 },
  zoomPercent: 100,
  theme: "light",
  motion: "no-preference",
} as const;

export const MANUAL_EVIDENCE_LANES = [
  {
    id: "windows-keyboard-edge",
    title: "Windows keyboard-only visual path",
    minimumRiskClass: 1,
    allowedCoverage: ["keyboard-manual-visual"],
    environment: {
      ...windowsDesktop,
      browser: "Edge",
      assistiveTechnology: null,
    },
  },
  {
    id: "windows-nvda-firefox",
    title: "Windows NVDA and Firefox primary semantic path",
    minimumRiskClass: 1,
    allowedCoverage: ["desktop-screen-reader-semantic-engine-a", "task-workflow"],
    environment: {
      ...windowsDesktop,
      browser: "Firefox",
      assistiveTechnology: "NVDA",
    },
  },
  {
    id: "macos-current-voiceover-safari",
    title: "Current macOS VoiceOver and Safari semantic path",
    minimumRiskClass: 1,
    versionSlot: "current",
    allowedCoverage: ["desktop-screen-reader-semantic-engine-b"],
    environment: {
      ...macDesktop,
      assistiveTechnology: "VoiceOver",
    },
  },
  {
    id: "macos-previous-voiceover-safari",
    title: "Previous macOS VoiceOver and Safari semantic path",
    minimumRiskClass: 1,
    versionSlot: "previous",
    allowedCoverage: ["desktop-screen-reader-semantic-engine-b"],
    environment: {
      ...macDesktop,
      viewport: { width: 1280, height: 800 },
      assistiveTechnology: "VoiceOver",
    },
  },
  {
    id: "windows-nvda-chrome",
    title: "Windows NVDA and Chrome comparison path",
    minimumRiskClass: 2,
    allowedCoverage: ["desktop-at-full", "interruption-recovery"],
    environment: {
      ...windowsDesktop,
      browser: "Chrome",
      assistiveTechnology: "NVDA",
    },
  },
  {
    id: "windows-jaws-current-edge",
    title: "Windows current JAWS and Edge enterprise path",
    minimumRiskClass: 2,
    versionSlot: "current",
    allowedCoverage: ["desktop-at-full", "performance-scale"],
    environment: {
      ...windowsDesktop,
      browser: "Edge",
      assistiveTechnology: "JAWS",
    },
  },
  {
    id: "windows-jaws-previous-edge",
    title: "Windows previous JAWS and Edge enterprise path",
    minimumRiskClass: 2,
    versionSlot: "previous",
    allowedCoverage: ["desktop-at-full"],
    environment: {
      ...windowsDesktop,
      browser: "Edge",
      assistiveTechnology: "JAWS",
    },
  },
  {
    id: "windows-high-contrast-edge",
    title: "Windows High Contrast keyboard path",
    minimumRiskClass: 2,
    allowedCoverage: ["forced-colors"],
    environment: {
      ...windowsDesktop,
      browser: "Edge",
      assistiveTechnology: null,
      theme: "forced-colors",
    },
  },
  {
    id: "windows-voice-access-edge",
    title: "Windows Voice Access and Edge path",
    minimumRiskClass: 2,
    allowedCoverage: ["desktop-at-full", "voice-control"],
    environment: {
      ...windowsDesktop,
      browser: "Edge",
      assistiveTechnology: "Voice Access",
      input: "voice",
    },
  },
  {
    id: "macos-full-keyboard-access-safari",
    title: "macOS Full Keyboard Access and Safari path",
    minimumRiskClass: 2,
    allowedCoverage: ["desktop-at-full"],
    environment: {
      ...macDesktop,
      assistiveTechnology: "Full Keyboard Access",
    },
  },
  {
    id: "macos-voice-control-safari",
    title: "macOS Voice Control and Safari path",
    minimumRiskClass: 2,
    allowedCoverage: ["desktop-at-full", "voice-control"],
    environment: {
      ...macDesktop,
      assistiveTechnology: "Voice Control",
      input: "voice",
    },
  },
  {
    id: "ios-current-voiceover-safari-touch",
    title: "Current iOS VoiceOver touch path",
    minimumRiskClass: 2,
    versionSlot: "current",
    allowedCoverage: ["touch-screen-reader-where-applicable", "mobile-at-full"],
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
    minimumRiskClass: 2,
    versionSlot: "previous",
    allowedCoverage: ["touch-screen-reader-where-applicable", "mobile-at-full"],
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
    minimumRiskClass: 2,
    versionSlot: "current",
    allowedCoverage: ["touch-screen-reader-where-applicable", "mobile-at-full"],
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
    minimumRiskClass: 2,
    versionSlot: "previous",
    allowedCoverage: ["touch-screen-reader-where-applicable", "mobile-at-full"],
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
    minimumRiskClass: 2,
    allowedCoverage: ["touch-screen-reader-where-applicable", "mobile-at-full"],
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
    minimumRiskClass: 2,
    versionSlot: "current",
    allowedCoverage: ["touch-screen-reader-where-applicable", "mobile-at-full"],
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
    minimumRiskClass: 2,
    versionSlot: "previous",
    allowedCoverage: ["touch-screen-reader-where-applicable", "mobile-at-full"],
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
    minimumRiskClass: 2,
    allowedCoverage: ["touch-screen-reader-where-applicable", "mobile-at-full"],
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
    minimumRiskClass: 2,
    allowedCoverage: ["zoom-reflow"],
    environment: {
      ...windowsDesktop,
      browser: "Firefox",
      assistiveTechnology: null,
      zoomPercent: 400,
    },
  },
  {
    id: "windows-nvda-firefox-rtl",
    title: "Windows NVDA and Firefox RTL path",
    minimumRiskClass: 2,
    allowedCoverage: ["rtl"],
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
    minimumRiskClass: 2,
    allowedCoverage: ["focus-restoration"],
    environment: {
      ...windowsDesktop,
      browser: "Chrome",
      assistiveTechnology: "NVDA",
    },
  },
  {
    id: "ios-switch-control-safari",
    title: "iOS Switch Control workflow path",
    minimumRiskClass: 3,
    allowedCoverage: ["switch-control"],
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
    minimumRiskClass: 3,
    allowedCoverage: ["switch-control"],
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
    minimumRiskClass: 3,
    allowedCoverage: ["switch-control"],
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
] as const satisfies readonly ManualEvidenceLane[];

export type ManualEvidenceLaneId = (typeof MANUAL_EVIDENCE_LANES)[number]["id"];

export interface ManualLaneClaim {
  readonly laneId: ManualEvidenceLaneId;
  readonly coverageId: ManualCoverageId;
}

export interface ManualDistinctVersionPair {
  readonly currentLaneId: ManualEvidenceLaneId;
  readonly previousLaneId: ManualEvidenceLaneId;
  readonly field: "osVersion" | "assistiveTechnology.version";
}

export const MANUAL_DISTINCT_VERSION_PAIRS = [
  {
    currentLaneId: "macos-current-voiceover-safari",
    previousLaneId: "macos-previous-voiceover-safari",
    field: "osVersion",
  },
  {
    currentLaneId: "windows-jaws-current-edge",
    previousLaneId: "windows-jaws-previous-edge",
    field: "assistiveTechnology.version",
  },
  {
    currentLaneId: "ios-current-voiceover-safari-touch",
    previousLaneId: "ios-previous-voiceover-safari-touch",
    field: "osVersion",
  },
  {
    currentLaneId: "ipados-current-voiceover-safari-touch",
    previousLaneId: "ipados-previous-voiceover-safari-touch",
    field: "osVersion",
  },
  {
    currentLaneId: "android-current-talkback-chrome-touch",
    previousLaneId: "android-previous-talkback-chrome-touch",
    field: "osVersion",
  },
] as const satisfies readonly ManualDistinctVersionPair[];

export function manualEvidenceLane(
  laneId: string,
): (typeof MANUAL_EVIDENCE_LANES)[number] | undefined {
  return MANUAL_EVIDENCE_LANES.find((lane) => lane.id === laneId);
}

export interface RiskClassPolicy {
  readonly riskClass: RiskClass;
  readonly requiredManualCoverage: readonly ManualCoverageId[];
  readonly requiredManualLaneClaims: readonly ManualLaneClaim[];
  readonly refreshEachBehavioralReleaseCandidate: boolean;
}

const classOneCoverage = [
  "keyboard-manual-visual",
  "desktop-screen-reader-semantic-engine-a",
  "desktop-screen-reader-semantic-engine-b",
] as const satisfies readonly ManualCoverageId[];

const classTwoCoverage = [
  ...classOneCoverage,
  "desktop-at-full",
  "touch-screen-reader-where-applicable",
  "forced-colors",
  "zoom-reflow",
  "rtl",
  "focus-restoration",
] as const satisfies readonly ManualCoverageId[];

const classOneLaneClaims = [
  { laneId: "windows-keyboard-edge", coverageId: "keyboard-manual-visual" },
  {
    laneId: "windows-nvda-firefox",
    coverageId: "desktop-screen-reader-semantic-engine-a",
  },
  {
    laneId: "macos-current-voiceover-safari",
    coverageId: "desktop-screen-reader-semantic-engine-b",
  },
  {
    laneId: "macos-previous-voiceover-safari",
    coverageId: "desktop-screen-reader-semantic-engine-b",
  },
] as const satisfies readonly ManualLaneClaim[];

const classTwoLaneClaims = [
  ...classOneLaneClaims,
  { laneId: "windows-nvda-chrome", coverageId: "desktop-at-full" },
  { laneId: "windows-jaws-current-edge", coverageId: "desktop-at-full" },
  { laneId: "windows-jaws-previous-edge", coverageId: "desktop-at-full" },
  { laneId: "windows-high-contrast-edge", coverageId: "forced-colors" },
  { laneId: "windows-voice-access-edge", coverageId: "desktop-at-full" },
  { laneId: "macos-full-keyboard-access-safari", coverageId: "desktop-at-full" },
  { laneId: "macos-voice-control-safari", coverageId: "desktop-at-full" },
  {
    laneId: "ios-current-voiceover-safari-touch",
    coverageId: "touch-screen-reader-where-applicable",
  },
  {
    laneId: "ios-previous-voiceover-safari-touch",
    coverageId: "touch-screen-reader-where-applicable",
  },
  {
    laneId: "ipados-current-voiceover-safari-touch",
    coverageId: "touch-screen-reader-where-applicable",
  },
  {
    laneId: "ipados-previous-voiceover-safari-touch",
    coverageId: "touch-screen-reader-where-applicable",
  },
  {
    laneId: "ipados-current-voiceover-safari-keyboard",
    coverageId: "touch-screen-reader-where-applicable",
  },
  {
    laneId: "android-current-talkback-chrome-touch",
    coverageId: "touch-screen-reader-where-applicable",
  },
  {
    laneId: "android-previous-talkback-chrome-touch",
    coverageId: "touch-screen-reader-where-applicable",
  },
  {
    laneId: "android-current-talkback-chrome-keyboard",
    coverageId: "touch-screen-reader-where-applicable",
  },
  { laneId: "windows-zoom-firefox", coverageId: "zoom-reflow" },
  { laneId: "windows-nvda-firefox-rtl", coverageId: "rtl" },
  {
    laneId: "windows-nvda-chrome-focus-restoration",
    coverageId: "focus-restoration",
  },
] as const satisfies readonly ManualLaneClaim[];

const classThreeLaneClaims = [
  ...classTwoLaneClaims,
  { laneId: "windows-nvda-firefox", coverageId: "task-workflow" },
  { laneId: "windows-nvda-chrome", coverageId: "interruption-recovery" },
  { laneId: "windows-jaws-current-edge", coverageId: "performance-scale" },
  { laneId: "windows-voice-access-edge", coverageId: "voice-control" },
  { laneId: "macos-voice-control-safari", coverageId: "voice-control" },
  { laneId: "ios-current-voiceover-safari-touch", coverageId: "mobile-at-full" },
  { laneId: "ios-previous-voiceover-safari-touch", coverageId: "mobile-at-full" },
  { laneId: "ipados-current-voiceover-safari-touch", coverageId: "mobile-at-full" },
  { laneId: "ipados-previous-voiceover-safari-touch", coverageId: "mobile-at-full" },
  {
    laneId: "ipados-current-voiceover-safari-keyboard",
    coverageId: "mobile-at-full",
  },
  { laneId: "android-current-talkback-chrome-touch", coverageId: "mobile-at-full" },
  { laneId: "android-previous-talkback-chrome-touch", coverageId: "mobile-at-full" },
  { laneId: "android-current-talkback-chrome-keyboard", coverageId: "mobile-at-full" },
  { laneId: "ios-switch-control-safari", coverageId: "switch-control" },
  { laneId: "ipados-switch-control-safari", coverageId: "switch-control" },
  { laneId: "android-switch-access-chrome", coverageId: "switch-control" },
] as const satisfies readonly ManualLaneClaim[];

export const RISK_CLASS_POLICIES = {
  1: {
    riskClass: 1,
    requiredManualCoverage: classOneCoverage,
    requiredManualLaneClaims: classOneLaneClaims,
    refreshEachBehavioralReleaseCandidate: false,
  },
  2: {
    riskClass: 2,
    requiredManualCoverage: classTwoCoverage,
    requiredManualLaneClaims: classTwoLaneClaims,
    refreshEachBehavioralReleaseCandidate: false,
  },
  3: {
    riskClass: 3,
    requiredManualCoverage: [
      ...classTwoCoverage,
      "mobile-at-full",
      "voice-control",
      "switch-control",
      "task-workflow",
      "interruption-recovery",
      "performance-scale",
    ],
    requiredManualLaneClaims: classThreeLaneClaims,
    refreshEachBehavioralReleaseCandidate: true,
  },
} as const satisfies Record<RiskClass, RiskClassPolicy>;

export type QualityLane =
  | "static"
  | "unit"
  | "story-state"
  | "semantic-query"
  | "axe"
  | "aria-snapshot"
  | "geometry"
  | "visual"
  | "browser-chromium"
  | "browser-firefox"
  | "browser-webkit"
  | "consumer-contract"
  | "forced-colors"
  | "zoom-reflow"
  | "rtl-i18n"
  | "focus-restoration"
  | "workflow"
  | "interruption-recovery"
  | "performance-scale";

export const QUALITY_LANE_ORDER = [
  "static",
  "unit",
  "story-state",
  "semantic-query",
  "axe",
  "aria-snapshot",
  "geometry",
  "visual",
  "browser-chromium",
  "browser-firefox",
  "browser-webkit",
  "consumer-contract",
  "forced-colors",
  "zoom-reflow",
  "rtl-i18n",
  "focus-restoration",
  "workflow",
  "interruption-recovery",
  "performance-scale",
] as const satisfies readonly QualityLane[];

export type BehaviorChangeKind =
  | "semantic"
  | "focus"
  | "keyboard"
  | "overlay"
  | "virtualization"
  | "announcement"
  | "responsive"
  | "locale"
  | "core-dependency"
  | "visual-only"
  | "documentation-only";

export interface QualityScheduleRequest {
  readonly riskClass: RiskClass;
  readonly changes: readonly BehaviorChangeKind[];
  readonly sharedInfrastructureChanged?: boolean;
}

export interface QualitySchedule {
  readonly pullRequest: readonly QualityLane[];
  readonly nightly: readonly QualityLane[];
  readonly releaseCandidate: readonly QualityLane[];
  readonly manualCoverage: readonly ManualCoverageId[];
  readonly manualLaneClaims: readonly ManualLaneClaim[];
  readonly manualEvidenceInvalidated: boolean;
  readonly runAllDependentSuites: boolean;
}

const invalidatingChanges = new Set<BehaviorChangeKind>([
  "semantic",
  "focus",
  "keyboard",
  "overlay",
  "virtualization",
  "announcement",
  "responsive",
  "locale",
  "core-dependency",
]);

function inPolicyOrder(lanes: ReadonlySet<QualityLane>): readonly QualityLane[] {
  return QUALITY_LANE_ORDER.filter((lane) => lanes.has(lane));
}

export function highestRiskClass(classes: readonly RiskClass[]): RiskClass {
  return classes.reduce<RiskClass>(
    (highest, current) => (current > highest ? current : highest),
    1,
  );
}

export function validateRiskInheritance(
  declared: RiskClass,
  behaviorModes: readonly RiskClass[],
  childRiskClasses: readonly RiskClass[] = [],
): { readonly valid: boolean; readonly required: RiskClass } {
  const required = highestRiskClass([...behaviorModes, ...childRiskClasses]);
  return { valid: declared >= required, required };
}

export function scheduleQualityChecks(request: QualityScheduleRequest): QualitySchedule {
  const changed = new Set(request.changes);
  const docsOnly =
    changed.size > 0 && [...changed].every((entry) => entry === "documentation-only");
  const manualEvidenceInvalidated = [...changed].some((entry) => invalidatingChanges.has(entry));
  const runAllDependentSuites = request.sharedInfrastructureChanged === true;

  const pullRequest = new Set<QualityLane>(["static", "unit"]);
  const nightly = new Set<QualityLane>();
  const releaseCandidate = new Set<QualityLane>();

  if (!docsOnly || runAllDependentSuites) {
    pullRequest.add("story-state");
    pullRequest.add("semantic-query");
    pullRequest.add("axe");
    pullRequest.add("geometry");
    pullRequest.add("browser-chromium");
    pullRequest.add("consumer-contract");
    nightly.add("aria-snapshot");
    nightly.add("visual");
    nightly.add("browser-firefox");
    nightly.add("browser-webkit");
  }

  if (request.riskClass >= 2 || runAllDependentSuites) {
    nightly.add("forced-colors");
    nightly.add("zoom-reflow");
    nightly.add("rtl-i18n");
    nightly.add("focus-restoration");
  }

  if (request.riskClass === 3 || runAllDependentSuites) {
    nightly.add("workflow");
    nightly.add("interruption-recovery");
    nightly.add("performance-scale");
  }

  for (const lane of pullRequest) releaseCandidate.add(lane);
  for (const lane of nightly) releaseCandidate.add(lane);
  if (request.riskClass === 3 && (manualEvidenceInvalidated || runAllDependentSuites)) {
    releaseCandidate.add("workflow");
    releaseCandidate.add("interruption-recovery");
    releaseCandidate.add("performance-scale");
  }

  return {
    pullRequest: inPolicyOrder(pullRequest),
    nightly: inPolicyOrder(nightly),
    releaseCandidate: inPolicyOrder(releaseCandidate),
    manualCoverage: [...RISK_CLASS_POLICIES[request.riskClass].requiredManualCoverage].sort(
      compareText,
    ),
    manualLaneClaims: [...RISK_CLASS_POLICIES[request.riskClass].requiredManualLaneClaims].sort(
      (left, right) =>
        compareText(left.laneId, right.laneId) || compareText(left.coverageId, right.coverageId),
    ),
    manualEvidenceInvalidated,
    runAllDependentSuites,
  };
}
