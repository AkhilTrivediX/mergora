export interface InstalledLicenseRecord {
  readonly name?: string;
  readonly versions?: readonly string[];
  readonly license?: string;
}

export type InstalledLicenseReport = Readonly<Record<string, readonly InstalledLicenseRecord[]>>;

export function validateDependencyLicenseReport(report: unknown): string[];

export function validateRepositoryLicenseFiles(root?: string): string[];
