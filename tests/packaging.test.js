import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

test("package executable points at the built CLI", async () => {
  const packageJson = JSON.parse(await readFile("package.json", "utf8"));
  const binPath = resolve(packageJson.bin["tmux-mcp"]);

  await access(binPath);

  const result = spawnSync(process.execPath, [binPath, "--help"], {
    encoding: "utf8",
  });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Usage:/);
});

test("bin paths are in npm's normalized form", async () => {
  const packageJson = JSON.parse(await readFile("package.json", "utf8"));
  for (const [name, target] of Object.entries(packageJson.bin)) {
    assert.doesNotMatch(target, /^\.\.?\//, `bin[${name}] must not start with ./ or ../`);
  }
});
