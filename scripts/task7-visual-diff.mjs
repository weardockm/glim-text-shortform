import { spawnSync } from "node:child_process";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const skillCli = path.resolve(
  process.env.USERPROFILE,
  ".codex/plugins/cache/sisyphuslabs/omo/4.15.1/skills/visual-qa/scripts/visual-qa.mjs",
);
const root = path.resolve(
  ".omo/evidence/glim-production-roadmap/task-7",
);
const results = [];

for (const viewport of ["375", "768", "1280"]) {
  const baselineDirectory = path.join(root, "baseline", viewport);
  const actualDirectory = path.join(root, "actual", viewport);
  const files = (await readdir(baselineDirectory))
    .filter((file) => file.endsWith(".png"))
    .sort();
  for (const file of files) {
    const result = spawnSync(
      process.execPath,
      [
        skillCli,
        "image-diff",
        path.join(baselineDirectory, file),
        path.join(actualDirectory, file),
      ],
      { encoding: "utf8", timeout: 30_000 },
    );
    if (result.status !== 0) {
      throw new Error(
        `visual diff failed for ${viewport}/${file}: ${result.stderr}`,
      );
    }
    results.push({
      viewport: Number(viewport),
      state: file.replace(/\.png$/, ""),
      ...JSON.parse(result.stdout),
    });
  }
}

const summary = {
  compared: results.length,
  dimensionsMatch: results.every(({ dimensionsMatch }) => dimensionsMatch),
  alphaChannelIntact: results.every(
    ({ alphaChannelIntact }) => alphaChannelIntact,
  ),
  minimumSimilarityScore: Math.min(
    ...results.map(({ similarityScore }) => similarityScore),
  ),
  maximumDiffRatio: Math.max(...results.map(({ diffRatio }) => diffRatio)),
  changedStates: results
    .filter(({ diffPixels }) => diffPixels > 0)
    .map(({ viewport, state, diffRatio, similarityScore, hotspots }) => ({
      viewport,
      state,
      diffRatio,
      similarityScore,
      hotspots,
    })),
};
await mkdir(path.join(root, "visual-diff"), { recursive: true });
await writeFile(
  path.join(root, "visual-diff", "results.json"),
  `${JSON.stringify(results, null, 2)}\n`,
  "utf8",
);
await writeFile(
  path.join(root, "visual-diff", "summary.json"),
  `${JSON.stringify(summary, null, 2)}\n`,
  "utf8",
);
console.log(
  `PASS visual diff: ${summary.compared} states, minSimilarity=${summary.minimumSimilarityScore}, maxDiffRatio=${summary.maximumDiffRatio}`,
);
