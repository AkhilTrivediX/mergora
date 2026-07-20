export type PublicationChannel = "next" | "stable";

export interface PublicationContext {
  readonly channel: PublicationChannel;
  readonly commit: string;
  readonly environment: "npm-next" | "npm-production";
  readonly ref: string;
  readonly repository: string;
  readonly tag: string | null;
  readonly verificationRunId: string;
  readonly workflow: "publish-next.yml" | "publish-production.yml";
}

export interface PublicationPackage {
  readonly directory: string;
  readonly manifest: Readonly<Record<string, unknown>>;
  readonly mapPath: readonly string[];
  readonly name: string;
  readonly role: string;
  readonly version: string;
}

export interface PublicationTopology {
  readonly byName: ReadonlyMap<string, PublicationPackage>;
  readonly channel: PublicationChannel;
  readonly order: readonly PublicationPackage[];
  readonly productVersion: string;
}

export interface PublicationArtifact {
  readonly file: string;
  readonly name: string;
  readonly role?: string;
  readonly sha256: string;
  readonly version: string;
}

export class PublicationContractError extends Error {}

export const CANONICAL_REPOSITORY: "AkhilTrivediX/mergora";
export const CANONICAL_REPOSITORY_URL: "https://github.com/AkhilTrivediX/mergora";
export const PUBLIC_PACKAGE_DEFINITIONS: readonly Readonly<{
  directory: string;
  mapPath: readonly string[];
  role: string;
}>[];

export function validatePublicationContext(
  channel: PublicationChannel,
  environment: Readonly<Record<string, string | undefined>>,
): PublicationContext;

export function validatePackageTopology(options: {
  readonly channel: PublicationChannel;
  readonly manifests: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
  readonly packageMap: Readonly<Record<string, unknown>>;
  readonly rootManifest: Readonly<Record<string, unknown>>;
}): PublicationTopology;

export function validateReleaseEvidence(options: {
  readonly channel: PublicationChannel;
  readonly commit: string;
  readonly packedEvidence: Readonly<Record<string, unknown>>;
  readonly packedEvidenceBytes: Uint8Array;
  readonly summary: Readonly<Record<string, unknown>>;
  readonly topology: PublicationTopology;
}): Readonly<{
  packedArtifacts: ReadonlyMap<string, PublicationArtifact>;
  releaseArtifacts: ReadonlyMap<string, PublicationArtifact>;
}>;

export function assertPackedArtifactsMatchEvidence(
  actualArtifacts: readonly PublicationArtifact[],
  evidenceArtifacts: ReadonlyMap<string, PublicationArtifact>,
  topology: PublicationTopology,
): void;
