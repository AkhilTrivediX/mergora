import { describe, expect, it, vi } from "vitest";

import { resolveAutomaticNativeReleaseReference } from "../../packages/cli/src/native-release-routing.js";

const reference = {
  schemaVersion: 1 as const,
  artifactKind: "mergora-native-release-reference" as const,
  registryId: "partner",
  release: "1.2.3",
  catalog: { digest: `sha256:${"a".repeat(64)}` as const, bytes: 101 },
  manifest: { digest: `sha256:${"b".repeat(64)}` as const, bytes: 202 },
};

describe("automatic native release routing", () => {
  it("discovers an enrolled native current Stable reference online", async () => {
    const discoverEnrolled = vi.fn(async () => reference);
    const discoverStableVendor = vi.fn(() => null);

    await expect(
      resolveAutomaticNativeReleaseReference(
        { projectRoot: ".", registryId: "partner", offline: false },
        { discoverEnrolled, discoverStableVendor },
      ),
    ).resolves.toBe(reference);
    expect(discoverEnrolled).toHaveBeenCalledWith({ projectRoot: ".", registryId: "partner" });
    expect(discoverStableVendor).not.toHaveBeenCalled();
  });

  it("fails closed for an offline enrolled registry without external vendor evidence", async () => {
    const discoverEnrolled = vi.fn(async () => reference);
    const discoverStableVendor = vi.fn(() => null);

    await expect(
      resolveAutomaticNativeReleaseReference(
        { projectRoot: ".", registryId: "partner", offline: true },
        { discoverEnrolled, discoverStableVendor },
      ),
    ).rejects.toMatchObject({
      code: "REGISTRY_RELEASE_DISCOVERY_OFFLINE_UNAVAILABLE",
      exitCode: 4,
    });
    expect(discoverEnrolled).not.toHaveBeenCalled();
    expect(discoverStableVendor).not.toHaveBeenCalled();
  });

  it("selects the one verified official Stable vendor reference only while offline", async () => {
    const vendorReference = { ...reference, registryId: "official" as const };
    const discoverEnrolled = vi.fn(async () => reference);
    const discoverStableVendor = vi.fn(() => vendorReference);

    await expect(
      resolveAutomaticNativeReleaseReference(
        { projectRoot: ".", registryId: "official", offline: true },
        { discoverEnrolled, discoverStableVendor },
      ),
    ).resolves.toBe(vendorReference);
    expect(discoverStableVendor).toHaveBeenCalledWith({ projectRoot: "." });
    expect(discoverEnrolled).not.toHaveBeenCalled();
  });

  it("preserves the ordinary official unreleased route online", async () => {
    const discoverEnrolled = vi.fn(async () => reference);
    const discoverStableVendor = vi.fn(() => null);

    await expect(
      resolveAutomaticNativeReleaseReference(
        { projectRoot: ".", registryId: "official", offline: false },
        { discoverEnrolled, discoverStableVendor },
      ),
    ).resolves.toBeNull();
    expect(discoverEnrolled).not.toHaveBeenCalled();
    expect(discoverStableVendor).not.toHaveBeenCalled();
  });
});
