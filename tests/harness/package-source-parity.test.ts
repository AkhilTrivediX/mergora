import { describe, expect, it } from "vitest";

import {
  REQUIRED_PARITY_PROBES,
  RuntimeCapabilityError,
  comparePackageSourceParity,
  runPackageSourceParity,
  type DistributionObservation,
} from "../../packages/test-utils/src/index.js";

const sourceDigest = `sha256:${"a".repeat(64)}`;
const packageDigest = `sha256:${"b".repeat(64)}`;
const copiedSourceDigest = `sha256:${"c".repeat(64)}`;
const probeDigest = `sha256:${"d".repeat(64)}`;

function observation(mode: "package" | "source"): DistributionObservation {
  return {
    schemaVersion: 1,
    mode,
    itemId: "button",
    canonicalSourceDigest: sourceDigest,
    artifactDigest: mode === "package" ? packageDigest : copiedSourceDigest,
    contractVersion: "1.0.0",
    probes: REQUIRED_PARITY_PROBES.map((id) => ({
      id,
      state: "pass",
      digest: probeDigest,
      summary: `${id} normalized observation completed.`,
    })),
  };
}

describe("package/source parity", () => {
  it("accepts different artifacts only when every public observation matches", () => {
    const result = comparePackageSourceParity(observation("package"), observation("source"));
    expect(result.state).toBe("pass");
    expect(result.issues).toEqual([]);
    expect(result.packageObservation.artifactDigest).not.toBe(
      result.sourceObservation.artifactDigest,
    );
  });

  it("fails a normalized behavior mismatch and an absent runtime", async () => {
    const source = observation("source");
    const changed = {
      ...source,
      probes: source.probes.map((probe) =>
        probe.id === "behavior" && probe.state === "pass"
          ? { ...probe, digest: `sha256:${"e".repeat(64)}` }
          : probe,
      ),
    };
    const result = comparePackageSourceParity(observation("package"), changed);
    expect(result.state).toBe("fail");
    expect(result.issues.map((entry) => entry.code)).toContain("parity.probe-digest-mismatch");

    await expect(runPackageSourceParity(undefined, {}, {})).rejects.toBeInstanceOf(
      RuntimeCapabilityError,
    );
  });
});
