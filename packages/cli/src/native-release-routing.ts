import { CliError } from "./contracts.js";
import {
  discoverNativeReleaseReference,
  type DiscoveredNativeReleaseReference,
} from "./registry-management.js";
import {
  discoverStableVendorReleaseReference,
  type DiscoveredStableVendorReleaseReference,
} from "./vendor-reader.js";

export type AutomaticNativeReleaseReference =
  DiscoveredNativeReleaseReference | DiscoveredStableVendorReleaseReference;

export interface AutomaticNativeReleaseRoutingOptions {
  readonly projectRoot: string;
  readonly registryId: string;
  readonly offline: boolean;
}

export interface AutomaticNativeReleaseRoutingDependencies {
  readonly discoverEnrolled?: typeof discoverNativeReleaseReference | undefined;
  readonly discoverStableVendor?: typeof discoverStableVendorReleaseReference | undefined;
}

/**
 * Selects only evidence that can be converted immediately into an immutable
 * native reference. Official unreleased source remains a separate null route;
 * enrolled registries never fall back to it, and offline enrolled acquisition
 * cannot silently attempt the network.
 */
export async function resolveAutomaticNativeReleaseReference(
  options: AutomaticNativeReleaseRoutingOptions,
  dependencies: AutomaticNativeReleaseRoutingDependencies = {},
): Promise<AutomaticNativeReleaseReference | null> {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(options.registryId)) {
    throw new CliError("Automatic release routing received an invalid registry ID.", {
      code: "ITEM_REFERENCE_INVALID",
      exitCode: 2,
      target: options.registryId,
    });
  }
  if (options.registryId === "official") {
    if (!options.offline) return null;
    return (dependencies.discoverStableVendor ?? discoverStableVendorReleaseReference)({
      projectRoot: options.projectRoot,
    });
  }
  if (options.offline) {
    throw new CliError(
      `Offline registry ${JSON.stringify(options.registryId)} requires an explicit exact release reference; external Stable vendor evidence is not configured.`,
      {
        code: "REGISTRY_RELEASE_DISCOVERY_OFFLINE_UNAVAILABLE",
        exitCode: 4,
        target: options.registryId,
      },
    );
  }
  return (dependencies.discoverEnrolled ?? discoverNativeReleaseReference)({
    projectRoot: options.projectRoot,
    registryId: options.registryId,
  });
}
