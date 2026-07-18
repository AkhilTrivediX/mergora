/// <reference types="vite/client" />

import type {
  AxeRunResult,
  ContractAssessment,
} from "../../../../packages/test-utils/src/runtime-contracts.ts";
import type { SemanticQuery } from "../../../../packages/test-utils/src/semantic-query.ts";

export interface BrowserSemanticResult {
  readonly dataSlot: string | null;
  readonly tagName: string;
  readonly text: string;
}

export interface MergoraEvidenceBridge {
  query(query: SemanticQuery): BrowserSemanticResult;
  runAxe(): Promise<{
    readonly assessment: ContractAssessment;
    readonly result: AxeRunResult;
  }>;
}

declare global {
  interface Window {
    __mergoraEvidence: MergoraEvidenceBridge;
  }
}
