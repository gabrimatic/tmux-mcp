import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertCwdAllowed, assertCommandAllowed, assertSessionName, assertTarget, commandRisk } from "../dist/src/policy.js";

test("validates session names and targets", () => {
  assert.doesNotThrow(() => assertSessionName("agent-dev_1"));
  assert.doesNotThrow(() => assertTarget("agent-dev_1:0.0"));
  assert.doesNotThrow(() => assertTarget("%12"));
  assert.throws(() => assertSessionName("bad:name"));
  assert.throws(() => assertTarget("$(oops)"));
});

test("enforces cwd roots", async () => {
  const root = await mkdtemp(join(tmpdir(), "tmux-mcp-root-"));
  const child = join(root, "project");
  const config = { allowedRoots: [root], allowAnyCwd: false };
  assert.equal(assertCwdAllowed(child, config), child);
  assert.throws(() => assertCwdAllowed("/etc", config));
});

test("flags destructive command patterns", () => {
  assert.equal(commandRisk("echo ok").length, 0);
  assert.ok(commandRisk("rm -rf /").length > 0);
  assert.throws(() => assertCommandAllowed("sudo rm -rf /tmp/example", false));
  assert.doesNotThrow(() => assertCommandAllowed("sudo rm -rf /tmp/example", true));
});
