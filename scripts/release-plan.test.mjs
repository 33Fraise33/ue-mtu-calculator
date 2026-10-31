import { describe, expect, it } from "vitest";
import { planReleases } from "./release-plan.mjs";

describe("release planning", () => {
  it("versions every first-parent commit in order regardless of its message", () => {
    expect(planReleases(["build-deps", "docs", "merge"], [{ name: "v1.0.0", sha: "old" }], true)).toEqual([
      { commit: "build-deps", tag: "v1.0.1", create: true },
      { commit: "docs", tag: "v1.0.2", create: true },
      { commit: "merge", tag: "v1.0.3", create: true },
    ]);
  });
  it("reuses tags on retries and catches up after an interrupted run", () => {
    const tags = [{ name: "v1.0.0", sha: "old" }, { name: "v1.0.1", sha: "a" }];
    expect(planReleases(["a", "b"], tags, true)).toEqual([
      { commit: "a", tag: "v1.0.1", create: false }, { commit: "b", tag: "v1.0.2", create: true },
    ]);
  });
  it("uses the highest stable version, not lexicographic order or prereleases", () => {
    expect(planReleases(["a"], [{ name: "v1.0.9", sha: "x" }, { name: "v1.0.10", sha: "y" }, { name: "v9.0.0-rc.1", sha: "z" }], true)[0].tag).toBe("v1.0.11");
  });
  it("does not create tags on manual runs", () => {
    expect(() => planReleases(["a"], [{ name: "v1.0.0", sha: "old" }], false)).toThrow("No version tag");
    expect(planReleases(["a"], [{ name: "v1.0.1", sha: "a" }], false)[0].create).toBe(false);
  });
  it("rejects missing baselines and ambiguous tags", () => {
    expect(() => planReleases(["a"], [], true)).toThrow("No stable version");
    expect(() => planReleases(["a"], [{ name: "v1.0.0", sha: "a" }, { name: "v1.0.1", sha: "a" }], true)).toThrow("Multiple version tags");
  });
});
