import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  assertCommandAllowed,
  assertCwdAllowed,
  assertPathAllowed,
  assertSessionName,
  assertShellPath,
  assertTarget,
  commandRisk,
} from "../dist/src/policy.js";

test("validates session names and targets", () => {
  assert.doesNotThrow(() => assertSessionName("agent-dev_1"));
  assert.doesNotThrow(() => assertTarget("agent-dev_1:0.0"));
  assert.doesNotThrow(() => assertTarget("%12"));
  assert.throws(() => assertSessionName("bad:name"));
  assert.throws(() => assertTarget("$(oops)"));
});

test("validates shell paths", () => {
  assert.equal(assertShellPath("/bin/zsh"), "/bin/zsh");
  assert.equal(assertShellPath("/opt/homebrew/bin/fish"), "/opt/homebrew/bin/fish");
  assert.throws(() => assertShellPath("zsh"), /Shell must be an absolute path/);
  assert.throws(() => assertShellPath("/bin/zsh; rm -rf /"), /Shell path contains unsupported characters/);
  assert.throws(() => assertShellPath("/bin/zsh && echo pwned"), /Shell path contains unsupported characters/);
});

test("enforces cwd roots", async () => {
  const root = await mkdtemp(join(tmpdir(), "tmux-mcp-root-"));
  const child = join(root, "project");
  const config = { allowedRoots: [root], allowAnyCwd: false };
  assert.equal(assertCwdAllowed(child, config), child);
  assert.throws(() => assertCwdAllowed("/etc", config));
});

test("enforces writable paths under allowed roots", async () => {
  const root = await mkdtemp(join(tmpdir(), "tmux-mcp-root-"));
  const inside = join(root, "logs", "pane.log");
  const outside = join(tmpdir(), `tmux-mcp-outside-${Date.now()}.log`);
  const config = { allowedRoots: [root], allowAnyCwd: false };

  assert.equal(assertPathAllowed(inside, config, "log path"), inside);
  assert.throws(() => assertPathAllowed(outside, config, "log path"), /log path is outside allowed roots/);
});

test("flags destructive command patterns", () => {
  assert.equal(commandRisk("echo ok").length, 0);
  assert.ok(commandRisk("rm -rf /").length > 0);
  assert.throws(() => assertCommandAllowed("sudo rm -rf /tmp/example", false));
  assert.doesNotThrow(() => assertCommandAllowed("sudo rm -rf /tmp/example", true));
});
