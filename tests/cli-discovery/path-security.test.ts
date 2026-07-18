import { describe, expect, it } from "vitest";

import {
  assertPortableRelativePath,
  redactMessage,
  resolveInside,
} from "../../packages/cli/src/contracts.ts";

describe("portable project path policy", () => {
  it.each([
    ["", "empty"],
    ["/absolute/file.ts", "absolute POSIX"],
    ["C:/absolute/file.ts", "drive path"],
    ["\\\\server\\share\\file.ts", "UNC path"],
    ["src\\file.ts", "backslash"],
    ["../outside.ts", "parent traversal"],
    ["src/../outside.ts", "nested parent traversal"],
    ["%2e%2e/outside.ts", "encoded traversal"],
    ["%252e%252e/outside.ts", "double-encoded traversal"],
    ["src/control\u0000.ts", "NUL"],
    ["src/control\u001f.ts", "control character"],
    ["src/CON", "reserved Windows device"],
    ["src/nul.txt", "reserved Windows device with extension"],
    ["src/trailing.", "trailing dot"],
    ["src/trailing ", "trailing space"],
    ["src/cafe\u0301.ts", "non-NFC Unicode"],
    ["src//file.ts", "empty segment"],
  ])("rejects %s (%s)", (value) => {
    expect(() => assertPortableRelativePath(value, "Fixture path")).toThrow();
  });

  it("accepts only the narrow well-known Mergora dot paths", () => {
    expect(assertPortableRelativePath(".mergora/manifest.json", "Manifest")).toEqual([
      ".mergora",
      "manifest.json",
    ]);
    expect(assertPortableRelativePath(".gitignore", "Ignore file")).toEqual([".gitignore"]);
    expect(() => assertPortableRelativePath(".env", "Environment file")).toThrow();
    expect(() => assertPortableRelativePath(".git/config", "Git config")).toThrow();
  });

  it("resolves accepted targets under the selected root only", () => {
    const root = process.platform === "win32" ? "C:\\fixture\\project" : "/fixture/project";
    const target = resolveInside(root, "src/components/button.tsx", "Target");
    expect(target.startsWith(root)).toBe(true);
    expect(() => resolveInside(root, "../outside", "Target")).toThrow();
  });

  it("redacts machine paths, credentials, and sensitive arguments", () => {
    const message = redactMessage(
      "Failed C:\\Users\\person\\project\\file.ts and /tmp/person/project/file.ts at " +
        "https://user:password@example.com/path?token=secret&mode=read --auth=private",
    );
    expect(message).not.toContain("person");
    expect(message).not.toContain("password");
    expect(message).not.toContain("token=secret");
    expect(message).not.toContain("auth=private");
    expect(message).toContain(
      "https://<redacted>@example.com/path?token=<redacted>&mode=read --auth=<redacted>",
    );
  });
});
