import test from "node:test";
import assert from "node:assert/strict";
import { access, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

test("MCP stdio server exposes a full persistent terminal workflow", async () => {
  const root = await mkdtemp(join(tmpdir(), "tmux-mcp-e2e-"));
  const socket = join(root, "tmux.sock");
  const audit = join(root, "audit.jsonl");
  const cli = resolve("dist/src/cli.js");
  const session = `e2e-${Date.now()}`;
  const client = new Client({ name: "tmux-mcp-e2e", version: "0.0.0" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [cli, "--socket", socket, "--allowed-root", root, "--audit-log", audit, "--max-capture-lines", "300"],
  });

  await client.connect(transport);
  try {
    const tools = await client.listTools();
    for (const name of [
      "create_session",
      "run_command",
      "capture_output",
      "wait_for_output",
      "send_text",
      "send_keys",
      "interrupt",
      "attach_hint",
      "kill_target",
      "god_mode_terminal",
    ]) {
      assert.ok(tools.tools.some((tool) => tool.name === name), `${name} should be registered`);
    }

    const created = await client.callTool({
      name: "create_session",
      arguments: { name: session, cwd: root },
    });
    assert.equal(created.isError, undefined);
    assert.equal(created.structuredContent.session, session);
    assert.ok(created.structuredContent.correlation_id);

    const run = await client.callTool({
      name: "run_command",
      arguments: { target: session, command: "printf 'hello from mcp\\n'", settle_ms: 500, capture_lines: 50 },
    });
    assert.match(run.content[0].text, /hello from mcp/);
    assert.match(run.structuredContent.output, /hello from mcp/);

    const logPath = join(root, "pane.log");
    const logging = await client.callTool({
      name: "start_logging",
      arguments: { target: session, path: logPath },
    });
    assert.equal(logging.structuredContent.ok, true);

    await client.callTool({
      name: "send_text",
      arguments: { target: session, text: "printf 'typed text works\\n'" },
    });
    await client.callTool({
      name: "send_keys",
      arguments: { target: session, keys: ["Enter"] },
    });

    const wait = await client.callTool({
      name: "wait_for_output",
      arguments: { target: session, text: "typed text works", timeout_ms: 2000 },
    });
    assert.match(wait.content[0].text, /"matched": true/);

    await client.callTool({
      name: "create_window",
      arguments: { target: session, name: "second", cwd: root },
    });
    await client.callTool({
      name: "split_pane",
      arguments: { target: `${session}:second`, horizontal: true, percent: 40, cwd: root },
    });

    const panes = await client.callTool({
      name: "list_panes",
      arguments: { target: session },
    });
    assert.ok(panes.structuredContent.panes.length >= 2);
    const paneId = panes.structuredContent.panes.find((pane) => pane.session === session)?.paneId;
    assert.ok(paneId);

    await client.callTool({
      name: "resize_pane",
      arguments: { target: paneId, direction: "right", cells: 1 },
    });

    await client.callTool({
      name: "run_command",
      arguments: { target: session, command: "sleep 5", settle_ms: 100, capture_lines: 20 },
    });
    const interrupted = await client.callTool({
      name: "interrupt",
      arguments: { target: session },
    });
    assert.equal(interrupted.structuredContent.ok, true);

    const blocked = await client.callTool({
      name: "run_command",
      arguments: { target: session, command: "rm -rf /", settle_ms: 0 },
    });
    assert.equal(blocked.isError, true);
    assert.match(blocked.content[0].text, /dangerous command policy/);

    const denied = await client.callTool({
      name: "create_session",
      arguments: { name: `${session}-denied`, cwd: "/etc" },
    });
    assert.equal(denied.isError, true);
    assert.match(denied.content[0].text, /outside allowed roots/);

    const hint = await client.callTool({
      name: "attach_hint",
      arguments: { target: session },
    });
    assert.match(hint.content[0].text, /tmux/);
    assert.match(hint.content[0].text, /attach -t/);

    const capture = await client.callTool({
      name: "capture_output",
      arguments: { target: session, lines: 80 },
    });
    assert.match(capture.structuredContent.output, /sleep 5|\^C/);

    const stopped = await client.callTool({
      name: "stop_logging",
      arguments: { target: session },
    });
    assert.equal(stopped.structuredContent.ok, true);
    await access(logPath);

    const godSession = `${session}-god`;
    const god = await client.callTool({
      name: "god_mode_terminal",
      arguments: { name: godSession, cwd: root, command: "printf 'god mode ready\\n'" },
    });
    assert.match(god.structuredContent.output, /god mode ready/);
    assert.ok(god.structuredContent.pane.startsWith("%"));
    await client.callTool({
      name: "kill_target",
      arguments: { kind: "session", target: godSession },
    });

    await client.callTool({
      name: "kill_target",
      arguments: { kind: "session", target: session },
    });

    const auditText = await readFile(audit, "utf8");
    assert.match(auditText, /create_session/);
    assert.match(auditText, /run_command/);
    assert.match(auditText, /start_logging/);
    assert.match(auditText, /god_mode_terminal/);
    assert.match(auditText, /kill_target/);
  } finally {
    await client.close();
  }
});
