import type {
  AggregateEvidenceState,
  ContractEvidenceState,
  MeasurementEvidenceState,
  PassportEvidenceState,
  ReleaseGateState,
} from "./types.ts";

export interface EvidenceStatesByContext {
  readonly measurement: MeasurementEvidenceState;
  readonly passport: PassportEvidenceState;
  readonly contract: ContractEvidenceState;
  readonly "release-gate": ReleaseGateState;
}

export type EvidenceContext = keyof EvidenceStatesByContext;
export type ContextualEvidenceState = EvidenceStatesByContext[EvidenceContext];

/**
 * The source plans use intentionally different evidence vocabularies for raw
 * measurements, passports, contracts, and release gates. This table is the one
 * canonical lossy projection used when those records are compared or rolled up.
 */
export const EVIDENCE_STATE_MAP = {
  measurement: {
    pass: "satisfied",
    fail: "failed",
    warning: "conditional",
    "manual-check": "conditional",
    "not-measurable": "unknown",
  },
  passport: {
    pass: "satisfied",
    "pass-with-limitation": "conditional",
    fail: "failed",
    "not-tested": "unknown",
    "not-applicable": "not-applicable",
    expired: "stale",
    "blocked-upstream": "blocked",
  },
  contract: {
    pass: "satisfied",
    fail: "failed",
    "blocked-upstream": "blocked",
    "not-applicable": "not-applicable",
  },
  "release-gate": {
    pass: "satisfied",
    fail: "failed",
    blocked: "blocked",
    "not-applicable": "not-applicable",
  },
} as const satisfies {
  readonly [Context in EvidenceContext]: Readonly<
    Record<EvidenceStatesByContext[Context], AggregateEvidenceState>
  >;
};

export function aggregateEvidenceState<Context extends EvidenceContext>(
  context: Context,
  state: EvidenceStatesByContext[Context],
): AggregateEvidenceState {
  const states = EVIDENCE_STATE_MAP[context] as Readonly<Record<string, AggregateEvidenceState>>;
  return states[state]!;
}

export function isEvidenceStateForContext<Context extends EvidenceContext>(
  context: Context,
  state: string,
): state is EvidenceStatesByContext[Context] {
  return Object.hasOwn(EVIDENCE_STATE_MAP[context], state);
}

export function evidenceStateMatchesAggregate(
  context: EvidenceContext,
  state: string,
  aggregateState: string,
): boolean {
  return (
    isEvidenceStateForContext(context, state) &&
    aggregateEvidenceState(context, state) === aggregateState
  );
}
