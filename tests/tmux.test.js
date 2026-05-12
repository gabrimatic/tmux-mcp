import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TmuxController } from "../dist/src/tmux.js";

function config(root, socketPath) {
  return {
    tmuxCommand: "tmux",
    socketPath,
    shell: process.env.SHELL ?? "/bin/zsh",
    allowedRoots: [root],
    allowAnyCwd: false,
    auditLogPath: join(root, "audit.jsonl"),
    auditIncludeOutput: false,
    maxCaptureLines: 500,
    waitPollMs: 100,
  };
}

test("creates a session, sends commands, captures output, and kills cleanly", async () => {
  const root = await mkdtemp(join(tmpdir(), "tmux-mcp-it-"));
  const socket = join(root, "tmux.sock");
  const tmux = new TmuxController(config(root, socket));
  const session = `it-${Date.now()}`;
  await tmux.createSession({ name: session, cwd: root });
  try {
    const sessions = await tmux.listSessions();
    assert.ok(sessions.some((item) => item.name === session));
    await tmux.sendText(session, "printf 'tmux-mcp-ready\\n'", true);
    await new Promise((resolve) => setTimeout(resolve, 400));
    const output = await tmux.capture(session, 50);
    assert.match(output, /tmux-mcp-ready/);
    const panes = await tmux.listPanes(session);
    assert.equal(panes.length, 1);
    assert.equal(panes[0].session, session);
    assert.ok(tmux.attachCommand(session).includes("attach -t"));
  } finally {
    await tmux.killTarget("session", session).catch(() => {});
  }
});
