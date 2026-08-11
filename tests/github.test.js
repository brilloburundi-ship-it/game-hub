import test from "node:test";
import assert from "node:assert/strict";
import { buildCodexBrief, splitRepository } from "../src/github.js";

const project = {
  repository: "owner/game",
  branch: "main",
  rootPath: "games/stable-game",
  liveUrl: "https://owner.github.io/game/games/stable-game/"
};

test("repository names are parsed without inventing another project", () => {
  assert.deepEqual(splitRepository("owner/game"), { owner: "owner", repo: "game" });
  assert.throws(() => splitRepository("game"), /owner\/name/);
  assert.throws(() => splitRepository("owner/game/copy"), /owner\/name/);
});

test("Codex brief preserves repository, branch, path, and live URL", () => {
  const brief = buildCodexBrief(project, "Make the player faster", "abc1234");
  assert.match(brief, /owner\/game/);
  assert.match(brief, /Branch: main/);
  assert.match(brief, /games\/stable-game/);
  assert.match(brief, /https:\/\/owner\.github\.io\/game\/games\/stable-game\//);
  assert.match(brief, /Make the player faster/);
  assert.match(brief, /Do not create a ZIP/);
  assert.match(brief, /same-URL deploy proof/);
});

test("Codex brief rejects an empty request by preserving an explicit request section", () => {
  const brief = buildCodexBrief(project, "   ", "abc1234");
  assert.match(brief, /Requested change:\n\n/);
  assert.match(brief, /verify the live URL/);
});
