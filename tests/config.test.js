import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "../dist/src/config.js";

test("explicit allowed roots replace the implicit process cwd root", async () => {
  const root = await mkdtemp(join(tmpdir(), "tmux-mcp-allowed-root-"));
  const config = parseArgs(["--allowed-root", root]);

  assert.deepEqual(config.allowedRoots, [resolve(root)]);
});

test("repeatable allowed roots are resolved and deduplicated", async () => {
  const root = await mkdtemp(join(tmpdir(), "tmux-mcp-allowed-root-"));
  const config = parseArgs(["--allowed-root", root, "--allowed-root", join(root, ".")]);

  assert.deepEqual(config.allowedRoots, [resolve(root)]);
});

test("rejects shell values that are not absolute paths", () => {
  assert.throws(() => parseArgs(["--shell", "zsh"]), /Shell must be an absolute path/);
  assert.throws(() => parseArgs(["--shell", "/bin/zsh; rm -rf /"]), /Shell path contains unsupported characters/);
});
