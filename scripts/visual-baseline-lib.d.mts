export interface VisualBaselineReview {
  readonly affectedStories: readonly string[];
  readonly explanation: string;
  readonly requiredLabel: string;
  readonly reviewBundleDigest: null | string;
  readonly reviewedAt: null | string;
  readonly reviewer: null | string;
  readonly status: "approved" | "provisional";
}

export interface VisualBaselineManifest {
  readonly acceptedCommit: string;
  readonly review: VisualBaselineReview;
}

export interface BaselineChangePolicyInput {
  readonly acceptedCommitIsAncestor: boolean;
  readonly baseCommit: string;
  readonly changed: boolean;
  readonly directFeaturePushAuthority: boolean;
  readonly hasPreviousManifest: boolean;
  readonly labels: ReadonlySet<string> | readonly string[];
  readonly manifest: VisualBaselineManifest;
}

export interface BaselineChangePolicyResult {
  readonly authorization:
    | "direct-feature-push-bootstrap"
    | "direct-feature-push-review-record"
    | "not-required"
    | "pull-request-label";
  readonly bootstrap: boolean;
  readonly changed: boolean;
}

export function hasCompleteApprovedReview(review: unknown): boolean;

export function evaluateBaselineChangePolicy(
  input: BaselineChangePolicyInput,
): BaselineChangePolicyResult;
