import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { planReleases } from "./release-plan.mjs";

// Start after the last main commit before this policy was introduced. Do not
// create retroactive releases for the preceding history.
const baseline = "ae0f4bbf35398f8a65de20f56b833861a5be7786";
const target = process.env.GITHUB_SHA;
const token = process.env.GH_TOKEN;
const repository = process.env.GITHUB_REPOSITORY;
const manual = process.env.GITHUB_EVENT_NAME === "workflow_dispatch";
if (!target || !token || !repository || !process.env.GITHUB_OUTPUT) throw new Error("Missing GitHub Actions environment");

function git(...args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

async function api(path, options = {}) {
  return fetch(`https://api.github.com/repos/${repository}${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", ...options.headers },
  });
}

const ancestry = git("rev-list", "--first-parent", target).split("\n");
if (!ancestry.includes(baseline)) throw new Error("Release baseline is not on the target's first-parent history");
const commits = git("rev-list", "--first-parent", "--reverse", `${baseline}..${target}`).split("\n").filter(Boolean);
if (!commits.length) throw new Error("The activation baseline has no release under this policy");
const tags = git("tag", "--list", "v*").split("\n").filter(Boolean).map((name) => ({ name, sha: git("rev-list", "-n", "1", name) }));
const plan = planReleases(commits, tags, !manual);

for (const { commit, tag, create } of plan) {
  if (create) {
    git("tag", tag, commit);
    // A collision fails rather than overwriting an independently created tag.
    git("push", "origin", `refs/tags/${tag}:refs/tags/${tag}`);
  }
  const existing = await api(`/releases/tags/${encodeURIComponent(tag)}`);
  if (existing.status === 404) {
    const created = await api("/releases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tag_name: tag, name: tag, generate_release_notes: true }),
    });
    if (!created.ok) throw new Error(`Cannot create release ${tag}: ${created.status} ${await created.text()}`);
  } else if (!existing.ok) {
    throw new Error(`Cannot inspect release ${tag}: ${existing.status} ${await existing.text()}`);
  }
}

const version = plan.at(-1).tag.slice(1);
appendFileSync(process.env.GITHUB_OUTPUT, `version=${version}\n`);
console.log(`Build ${target} as v${version}`);
