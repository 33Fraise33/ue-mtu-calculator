const stableVersion = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

function parts(tag) {
  const match = stableVersion.exec(tag);
  if (!match) return null;
  const numbers = match.slice(1).map(Number);
  if (numbers.some((number) => !Number.isSafeInteger(number))) throw new Error(`Version is too large: ${tag}`);
  return numbers;
}

export function planReleases(commits, tags, createMissing) {
  const versions = tags.map(({ name }) => ({ name, numbers: parts(name) })).filter(({ numbers }) => numbers);
  if (!versions.length) throw new Error("No stable version tag exists; create a baseline release first");
  versions.sort((a, b) => {
    for (let i = 0; i < 3; i++) if (a.numbers[i] !== b.numbers[i]) return a.numbers[i] - b.numbers[i];
    return 0;
  });
  let [major, minor, patch] = versions.at(-1).numbers;
  return commits.map((commit) => {
    const existing = tags.filter(({ name, sha }) => sha === commit && parts(name));
    if (existing.length > 1) throw new Error(`Multiple version tags on ${commit}`);
    if (existing.length === 1) return { commit, tag: existing[0].name, create: false };
    if (!createMissing) throw new Error(`No version tag on ${commit}; run the push workflow first`);
    if (!Number.isSafeInteger(patch + 1)) throw new Error("Patch version is too large");
    const tag = `v${major}.${minor}.${++patch}`;
    tags.push({ name: tag, sha: commit });
    return { commit, tag, create: true };
  });
}
