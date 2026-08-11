import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const projects = JSON.parse(await readFile(new URL("../data/projects.json", import.meta.url), "utf8"));

test("every project has one stable GitHub identity", () => {
  const ids = new Set();
  for (const project of projects) {
    assert.ok(project.id && !ids.has(project.id), `duplicate id: ${project.id}`);
    ids.add(project.id);
    assert.match(project.repository, /^[^/]+\/[^/]+$/);
    assert.ok(project.branch);
    assert.match(project.liveUrl, /^https:\/\//);
    assert.doesNotMatch(project.rootPath, /(?:^|\/)(?:v\d+|versions?|zips?|copies)(?:\/|$)/i);
  }
});

test("sample game has a permanent folder and same-URL proof marker", async () => {
  const sample = projects.find(project => project.id === "neon-orbit");
  assert.equal(sample.rootPath, "games/neon-orbit");
  const proof = JSON.parse(await readFile(new URL("../games/neon-orbit/version.json", import.meta.url), "utf8"));
  assert.match(proof.marker, /^neon-orbit-live-/);
});
