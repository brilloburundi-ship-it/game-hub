import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const output = resolve(root, "dist");
const deployFiles = [
  "index.html",
  "manifest.webmanifest",
  "sw.js",
  "404.html",
  "assets",
  "data",
  "games",
  "src"
];

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

for (const path of deployFiles) {
  await cp(resolve(root, path), resolve(output, path), { recursive: true });
}

await writeFile(
  resolve(output, "build-meta.json"),
  `${JSON.stringify({
    commit: process.env.GITHUB_SHA || "local",
    builtAt: new Date().toISOString()
  }, null, 2)}\n`
);

console.log(`Built ${deployFiles.length} static entries in dist/`);
