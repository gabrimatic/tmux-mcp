import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import type { ServerConfig } from "./types.js";
import { TmuxController } from "./tmux.js";
import { AuditLogger } from "./audit.js";
import { assertCommandAllowed } from "./policy.js";

const Target = z.string().min(1).describe("tmux target: session, session:window.pane, or %pane_id");
const SessionName = z.string().min(1).max(80).describe("tmux session name");
const Correlation = z.string().describe("Correlation ID for audit log lookup and debugging.");
const SessionInfoSchema = z.object({
  name: z.string(),
  windows: z.number(),
  created: z.string(),
  attached: z.boolean(),
});
const PaneInfoSchema = z.object({
  session: z.string(),
  windowIndex: z.number(),
  paneIndex: z.number(),
  paneId: z.string(),
  cwd: z.string(),
  command: z.string(),
  active: z.boolean(),
  title: z.string(),
});
const OkOutput = {
  correlation_id: Correlation,
  ok: z.boolean(),
};
const READ_ONLY: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};
const LOCAL_MUTATION: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
};
const TERMINAL_INPUT: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: true,
};
const DESTRUCTIVE: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
  openWorldHint: false,
};

export function createServer(config: ServerConfig): McpServer {
  const tmux = new TmuxController(config);
  const audit = new AuditLogger(config);
  const server = new McpServer({
    name: "tmux-mcp",
    version: "0.1.0",
  });

  server.registerResource(
    "operator-guide",
    "tmux-mcp://guide",
    {
      title: "TMUX MCP operator guide",
      description: "How agents should use persistent tmux sessions safely.",
      mimeType: "text/markdown",
    },
    async (uri) => ({
      contents: [{ uri: uri.href, text: guide(config) }],
    }),
  );

  server.registerResource(
    "audit-log",
    new ResourceTemplate("tmux-mcp://audit/{tail}", { list: undefined }),
    {
      title: "TMUX MCP audit log tail",
      description: "Tail the local JSONL audit log. tail is a number of lines.",
      mimeType: "application/jsonl",
    },
    async (uri, { tail }) => {
      const count = Math.max(1, Math.min(Number(tail), 500));
      const text = await readFile(config.auditLogPath, "utf8").catch(() => "");
      return {
        contents: [{ uri: uri.href, text: text.split("\n").filter(Boolean).slice(-count).join("\n") }],
      };
    },
  );

  tool(server, audit, "list_sessions", {
    title: "List tmux sessions",
    description: "List sessions on the dedicated tmux socket.",
    inputSchema: {},
    outputSchema: {
      correlation_id: Correlation,
      sessions: z.array(SessionInfoSchema),
      socket: z.string(),
    },
    annotations: READ_ONLY,
  }, async () => ({
    sessions: await tmux.listSessions(),
    socket: config.socketPath,
  }));

  tool(server, audit, "create_session", {
    title: "Create terminal session",
    description: "Create a detached tmux session in an allowed cwd. Returns an attach command for human inspection.",
    inputSchema: {
      name: SessionName,
      cwd: z.string().optional(),
      shell: z.string().optional(),
      window_name: z.string().optional(),
      command: z.string().optional().describe("Optional startup command run in the session shell."),
    },
    outputSchema: {
      correlation_id: Correlation,
      session: z.string(),
      cwd: z.string(),
      attachCommand: z.string(),
    },
    annotations: LOCAL_MUTATION,
  }, async ({ name, cwd, shell, window_name, command }) => tmux.createSession({
    name,
    cwd,
    shell,
    windowName: window_name,
    command,
  }));

  tool(server, audit, "list_panes", {
    title: "List panes",
    description: "List panes, cwd, active command, pane ids, and target coordinates.",
    inputSchema: {
      target: Target.optional(),
    },
    outputSchema: {
      correlation_id: Correlation,
      panes: z.array(PaneInfoSchema),
    },
    annotations: READ_ONLY,
  }, async ({ target }) => ({
    panes: await tmux.listPanes(target),
  }));

  tool(server, audit, "create_window", {
    title: "Create window",
    description: "Create a new tmux window in a session.",
    inputSchema: {
      target: Target,
      name: z.string().optional(),
      cwd: z.string().optional(),
      command: z.string().optional(),
    },
    outputSchema: OkOutput,
    annotations: LOCAL_MUTATION,
  }, async ({ target, name, cwd, command }) => {
    await tmux.createWindow({ target, name, cwd, command });
    return { ok: true };
  });

  tool(server, audit, "split_pane", {
    title: "Split pane",
    description: "Split a pane vertically or horizontally, optionally in a cwd or with a startup command.",
    inputSchema: {
      target: Target,
      horizontal: z.boolean().default(false),
      percent: z.number().int().min(1).max(99).optional(),
      cwd: z.string().optional(),
      command: z.string().optional(),
    },
    outputSchema: OkOutput,
    annotations: LOCAL_MUTATION,
  }, async ({ target, horizontal, percent, cwd, command }) => {
    await tmux.splitPane({ target, horizontal, percent, cwd, command });
    return { ok: true };
  });

  tool(server, audit, "send_text", {
    title: "Send literal text",
    description: "Send literal text to a pane. Set enter=true to press Enter after the text.",
    inputSchema: {
      target: Target,
      text: z.string(),
      enter: z.boolean().default(false),
    },
    outputSchema: OkOutput,
    annotations: TERMINAL_INPUT,
  }, async ({ target, text, enter }) => {
    await tmux.sendText(target, text, enter);
    return { ok: true };
  });

  tool(server, audit, "send_keys", {
    title: "Send special keys",
    description: "Send special keys like Enter, Escape, Tab, C-c, C-d, arrows, PageUp, or F1-F12.",
    inputSchema: {
      target: Target,
      keys: z.array(z.string()).min(1).max(32),
    },
    outputSchema: OkOutput,
    annotations: TERMINAL_INPUT,
  }, async ({ target, keys }) => {
    await tmux.sendKeys(target, keys);
    return { ok: true };
  });

  tool(server, audit, "run_command", {
    title: "Run command in pane",
    description: "Type a shell command into an existing pane, press Enter, wait briefly, and optionally capture output.",
    inputSchema: {
      target: Target,
      command: z.string().min(1),
      allow_dangerous: z.boolean().default(false),
      settle_ms: z.number().int().min(0).max(10000).default(500),
      capture_lines: z.number().int().min(1).max(config.maxCaptureLines).default(120),
    },
    outputSchema: {
      correlation_id: Correlation,
      ok: z.boolean(),
      output: z.string(),
    },
    annotations: TERMINAL_INPUT,
  }, async ({ target, command, allow_dangerous, settle_ms, capture_lines }) => {
    assertCommandAllowed(command, allow_dangerous);
    await tmux.sendText(target, command, true);
    if (settle_ms > 0) await sleep(settle_ms);
    const output = await tmux.capture(target, capture_lines);
    return { ok: true, output };
  });

  tool(server, audit, "capture_output", {
    title: "Capture terminal output",
    description: "Capture recent visible output from a pane.",
    inputSchema: {
      target: Target,
      lines: z.number().int().min(1).max(config.maxCaptureLines).default(200),
      include_escapes: z.boolean().default(false),
    },
    outputSchema: {
      correlation_id: Correlation,
      target: z.string(),
      output: z.string(),
    },
    annotations: READ_ONLY,
  }, async ({ target, lines, include_escapes }) => ({
    target,
    output: await tmux.capture(target, lines, include_escapes),
  }));

  tool(server, audit, "wait_for_output", {
    title: "Wait for terminal output",
    description: "Poll captured output until it contains text or matches a regex.",
    inputSchema: {
      target: Target,
      text: z.string().min(1),
      regex: z.boolean().default(false),
      timeout_ms: z.number().int().min(1).max(60000).default(10000),
      lines: z.number().int().min(1).max(config.maxCaptureLines).default(200),
    },
    outputSchema: {
      correlation_id: Correlation,
      matched: z.boolean(),
      elapsed_ms: z.number(),
      output: z.string(),
    },
    annotations: READ_ONLY,
  }, async ({ target, text, regex, timeout_ms, lines }) => {
    const started = Date.now();
    const pattern = regex ? new RegExp(text) : null;
    let output = "";
    while (Date.now() - started <= timeout_ms) {
      output = await tmux.capture(target, lines);
      if (pattern ? pattern.test(output) : output.includes(text)) {
        return { matched: true, elapsed_ms: Date.now() - started, output };
      }
      await sleep(config.waitPollMs);
    }
    return { matched: false, elapsed_ms: Date.now() - started, output };
  });

  tool(server, audit, "interrupt", {
    title: "Interrupt pane",
    description: "Send Ctrl-C to a pane.",
    inputSchema: {
      target: Target,
    },
    outputSchema: OkOutput,
    annotations: TERMINAL_INPUT,
  }, async ({ target }) => {
    await tmux.sendKeys(target, ["C-c"]);
    return { ok: true };
  });

  tool(server, audit, "attach_hint", {
    title: "Human attach command",
    description: "Return the exact tmux attach command for the dedicated socket.",
    inputSchema: {
      target: Target,
    },
    outputSchema: {
      correlation_id: Correlation,
      attachCommand: z.string(),
    },
    annotations: READ_ONLY,
  }, async ({ target }) => ({
    attachCommand: tmux.attachCommand(target),
  }));

  tool(server, audit, "resize_pane", {
    title: "Resize pane",
    description: "Resize a pane by cells in one direction.",
    inputSchema: {
      target: Target,
      direction: z.enum(["up", "down", "left", "right"]),
      cells: z.number().int().min(1).max(200),
    },
    outputSchema: OkOutput,
    annotations: LOCAL_MUTATION,
  }, async ({ target, direction, cells }) => {
    await tmux.resizePane(target, direction, cells);
    return { ok: true };
  });

  tool(server, audit, "start_logging", {
    title: "Start pipe-pane logging",
    description: "Stream future pane output into a local log file.",
    inputSchema: {
      target: Target,
      path: z.string().min(1),
    },
    outputSchema: {
      correlation_id: Correlation,
      ok: z.boolean(),
      path: z.string(),
    },
    annotations: LOCAL_MUTATION,
  }, async ({ target, path }) => {
    await tmux.startLogging(target, path);
    return { ok: true, path };
  });

  tool(server, audit, "stop_logging", {
    title: "Stop pipe-pane logging",
    description: "Stop pipe-pane logging for a pane.",
    inputSchema: {
      target: Target,
    },
    outputSchema: OkOutput,
    annotations: LOCAL_MUTATION,
  }, async ({ target }) => {
    await tmux.stopLogging(target);
    return { ok: true };
  });

  tool(server, audit, "kill_target", {
    title: "Kill pane, window, or session",
    description: "Kill a tmux pane, window, or session on the dedicated socket.",
    inputSchema: {
      kind: z.enum(["pane", "window", "session"]),
      target: Target,
    },
    outputSchema: OkOutput,
    annotations: DESTRUCTIVE,
  }, async ({ kind, target }) => {
    await tmux.killTarget(kind, target);
    return { ok: true };
  });

  tool(server, audit, "god_mode_terminal", {
    title: "Create god-mode terminal",
    description: "Create a ready-to-use persistent terminal with logging, capture, attach hint, and a first command option.",
    inputSchema: {
      name: SessionName,
      cwd: z.string().optional(),
      command: z.string().optional(),
      log_path: z.string().optional(),
    },
    outputSchema: {
      correlation_id: Correlation,
      session: z.string(),
      cwd: z.string(),
      pane: z.string(),
      log_path: z.string().optional(),
      attachCommand: z.string(),
      output: z.string(),
      next: z.array(z.string()),
    },
    annotations: TERMINAL_INPUT,
  }, async ({ name, cwd, command, log_path }) => {
    const created = await tmux.createSession({ name, cwd, windowName: "agent", command });
    const panes = await tmux.listPanes(name);
    const pane = panes[0]?.paneId ?? name;
    if (log_path) await tmux.startLogging(pane, log_path);
    if (command) await sleep(300);
    const output = await tmux.capture(pane, 120).catch(() => "");
    return {
      ...created,
      pane,
      log_path,
      attachCommand: tmux.attachCommand(name),
      output,
      next: [
        "Use run_command for shell commands that should be typed and captured.",
        "Use send_text and send_keys for prompts, REPLs, TUI programs, and debuggers.",
        "Use capture_output or wait_for_output before deciding the next action.",
        "Leave the session alive for human inspection, or kill_target when done.",
      ],
    };
  });

  return server;
}

type ToolSpec<T extends z.ZodRawShape> = {
  title: string;
  description: string;
  inputSchema: T;
  outputSchema: z.ZodRawShape;
  annotations: ToolAnnotations;
};

function tool<T extends z.ZodRawShape>(
  server: McpServer,
  audit: AuditLogger,
  name: string,
  spec: ToolSpec<T>,
  handler: (input: any) => Promise<Record<string, unknown>>,
): void {
  server.registerTool(name, spec as any, async (input: any) => {
    const correlation_id = randomUUID();
    try {
      const output = await handler(input);
      const structuredOutput = { correlation_id, ...output };
      await audit.record({
        tool: name,
        input_correlation_id: correlation_id,
        input: scrubInput(input as Record<string, unknown>),
        output: summarizeOutput(audit, structuredOutput),
      });
      return {
        content: [{ type: "text", text: JSON.stringify(structuredOutput, null, 2) }],
        structuredContent: structuredOutput,
      };
    } catch (error: any) {
      const message = error?.message ?? String(error);
      const structuredError = {
        correlation_id,
        status: "failed",
        error: message,
        retry_safe: false,
        next_suggested_action: nextActionForError(message),
      };
      await audit.record({
        tool: name,
        input_correlation_id: correlation_id,
        input: scrubInput(input as Record<string, unknown>),
        error: message,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(structuredError, null, 2) }],
        isError: true,
      };
    }
  });
}

function summarizeOutput(audit: AuditLogger, output: Record<string, unknown>): Record<string, unknown> {
  const summarized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(output)) {
    summarized[key] = typeof value === "string" && key.includes("output") ? audit.outputSummary(value) : value;
  }
  return summarized;
}

function scrubInput(input: Record<string, unknown>): Record<string, unknown> {
  if (typeof input.text === "string" && input.text.length > 500) {
    return { ...input, text: `${input.text.slice(0, 500)}...` };
  }
  return input;
}

function nextActionForError(message: string): string {
  if (message.includes("outside allowed roots")) {
    return "Create the session under an allowed root or restart the server with an explicit --allowed-root.";
  }
  if (message.includes("dangerous command policy")) {
    return "Ask for explicit approval, then retry run_command with allow_dangerous=true if still necessary.";
  }
  if (message.includes("can't find session") || message.includes("can't find pane")) {
    return "Call list_sessions and list_panes, then retry with a valid target.";
  }
  return "Inspect the input and current tmux state, then retry only if the operation is safe.";
}

function guide(config: ServerConfig): string {
  return `# TMUX MCP Operator Guide

Use this MCP server when a task needs a persistent, stateful terminal: dev servers, REPLs, prompts, debuggers, TUI tools, long-running tests, or logs that should remain inspectable.

Configured socket: \`${config.socketPath}\`
Allowed roots: ${config.allowAnyCwd ? "`any cwd`" : config.allowedRoots.map((root) => `\`${root}\``).join(", ")}
Audit log: \`${config.auditLogPath}\`

Recommended loop:

1. Create a project-scoped session with \`create_session\` or \`god_mode_terminal\`.
2. Start work with \`run_command\`, \`send_text\`, or \`send_keys\`.
3. Read state with \`capture_output\` or \`wait_for_output\`.
4. Continue in the same pane instead of restarting the environment.
5. Return \`attach_hint\` if a human should inspect or join the session.
6. Use \`interrupt\` or \`kill_target\` for cleanup when appropriate.

Safety notes:

- This controls a real shell. Treat it like direct terminal access.
- The dedicated tmux socket isolates these sessions from normal tmux sessions.
- cwd is limited unless the server is started with \`--allow-any-cwd\`.
- \`run_command\` blocks a small set of obviously destructive patterns unless \`allow_dangerous=true\`.
- \`send_text\` can still type anything, so agent policy and user approvals still matter.
`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
