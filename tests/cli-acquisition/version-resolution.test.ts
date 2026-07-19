import { describe, expect, it } from "vitest";

import {
  immutableReleaseSatisfies,
  resolveImmutableReleaseVersion,
} from "../../packages/cli/src/version-resolution.ts";

describe("immutable release version resolution", () => {
  it("selects the highest stable release for an omitted selector", () => {
    expect(
      resolveImmutableReleaseVersion(
        ["1.0.0", "1.3.0-beta.2", "1.2.4", "2.0.0-alpha.1"],
        undefined,
        { allowPrereleases: false },
      ),
    ).toBe("1.2.4");
  });

  it("resolves npm-compatible ranges to one exact immutable version", () => {
    expect(
      resolveImmutableReleaseVersion(["1.2.0", "1.4.2", "1.5.0", "2.0.0"], "^1.2.0", {
        allowPrereleases: false,
      }),
    ).toBe("1.5.0");
    expect(
      resolveImmutableReleaseVersion(["1.2.0", "1.4.2", "1.5.0"], "1.2 - 1.4", {
        allowPrereleases: false,
      }),
    ).toBe("1.4.2");
  });

  it("requires prerelease policy even for an exact prerelease", () => {
    expect(() =>
      resolveImmutableReleaseVersion(["2.0.0-beta.1"], "2.0.0-beta.1", {
        allowPrereleases: false,
      }),
    ).toThrow(/prerelease.*does not allow/iu);
    expect(
      resolveImmutableReleaseVersion(["2.0.0-beta.1"], "2.0.0-beta.1", {
        allowPrereleases: true,
      }),
    ).toBe("2.0.0-beta.1");
  });

  it("rejects mutable aliases at the immutable boundary", () => {
    expect(() =>
      resolveImmutableReleaseVersion(["1.0.0"], "latest", { allowPrereleases: false }),
    ).toThrow(/mutable release aliases/iu);
  });

  it("rejects absent exact versions, invalid ranges, duplicates, and noncanonical versions", () => {
    expect(() =>
      resolveImmutableReleaseVersion(["1.0.0"], "1.0.1", { allowPrereleases: false }),
    ).toThrow(/absent/iu);
    expect(() =>
      resolveImmutableReleaseVersion(["1.0.0"], "not a range", { allowPrereleases: false }),
    ).toThrow(/valid semantic-version range/iu);
    expect(() =>
      resolveImmutableReleaseVersion(["1.0.0", "1.0.0"], undefined, {
        allowPrereleases: false,
      }),
    ).toThrow(/repeats/iu);
    expect(() =>
      resolveImmutableReleaseVersion(["v1.0.0"], undefined, { allowPrereleases: false }),
    ).toThrow(/canonical/iu);
    expect(() =>
      resolveImmutableReleaseVersion(["1.0.0"], "1".repeat(161), {
        allowPrereleases: false,
      }),
    ).toThrow(/bounded/iu);
  });

  it("rejects range ambiguity across build-metadata variants", () => {
    expect(() =>
      resolveImmutableReleaseVersion(["1.0.0+linux", "1.0.0+windows"], "^1.0.0", {
        allowPrereleases: false,
      }),
    ).toThrow(/ambiguous/iu);
    expect(
      resolveImmutableReleaseVersion(["1.0.0+linux", "1.0.0+windows"], "1.0.0+linux", {
        allowPrereleases: false,
      }),
    ).toBe("1.0.0+linux");
  });

  it("checks migration ranges with the same prerelease policy", () => {
    expect(immutableReleaseSatisfies("1.4.2", ">=1.2 <2", { allowPrereleases: false })).toBe(true);
    expect(
      immutableReleaseSatisfies("2.0.0-beta.1", ">=2.0.0-beta.1 <2.0.0", {
        allowPrereleases: false,
      }),
    ).toBe(false);
    expect(
      immutableReleaseSatisfies("2.0.0-beta.1", ">=2.0.0-beta.1 <2.0.0", {
        allowPrereleases: true,
      }),
    ).toBe(true);
  });
});
