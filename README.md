# TMUX MCP

[![CI](https://github.com/gabrimatic/tmux-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/gabrimatic/tmux-mcp/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![MCP](https://img.shields.io/badge/MCP-stdio-blue.svg)]()
[![tmux](https://img.shields.io/badge/backend-tmux-green.svg)]()

TMUX MCP gives AI agents a real persistent terminal.

Most command tools are stateless: run a command, return output, forget the terminal. Real development is not like that. Dev servers stay alive. REPLs ask follow-up questions. Tests stream logs. Debuggers need keys. A human can attach, watch, type, tmux_interrupt, and continue.

This project exposes those human-terminal primitives through a strict Model Context Protocol server backed by a dedicated tmux socket.

```text
Codex / AI Agent
        ↓
TMUX MCP stdio server
        ↓
isolated tmux socket
        ↓
session / window / pane
        ↓
real shell, dev server, REPL, TUI, debugger
```

## What It Gives Agents

| Capability | MCP tool |
|------------|----------|
| Create a persistent terminal | `tmux_create_session`, `tmux_god_mode_terminal` |
| Type text or commands incrementally | `tmux_send_text`, `tmux_run_command` |
| Send special keys | `tmux_send_keys`, `tmux_interrupt` |
| Read terminal state | `tmux_capture_output`, `tmux_wait_for_output` |
| Manage layout | `tmux_create_window`, `tmux_split_pane`, `tmux_resize_pane`, `tmux_list_panes` |
| Stream future pane output to a file | `tmux_start_logging`, `tmux_stop_logging` |
| Let a human attach | `tmux_attach_hint` |
| Clean up | `tmux_kill_target` |

The agent can keep `npm run dev`, a Rails console, a Python REPL, `vim`, `lldb`, `pytest -f`, or an installer prompt alive inside the same terminal instead of restarting it every turn.

## Quick Start

Requirements:

- Node.js 22+
- tmux
- Codex CLI or any MCP client that supports stdio servers

```bash
npm install -g @gabrimatic/tmux-mcp
```

For local development:

```bash
git clone https://github.com/gabrimatic/tmux-mcp.git
cd tmux-mcp
npm install
npm run build
node dist/src/cli.js --help
```

## Codex Configuration

Add the server to `~/.codex/config.toml`:

```toml
[mcp_servers.tmux]
command = "/opt/homebrew/bin/node"
args = [
  "/Users/soroush/Developer/Projects/tmux-mcp/dist/src/cli.js",
  "--socket", "/tmp/codex-agent-tmux.sock",
  "--shell", "/bin/zsh",
  "--allowed-root", "/Users/soroush/Developer/Projects",
  "--audit-log", "/Users/soroush/.local/state/tmux-mcp/audit.jsonl"
]
cwd = "/Users/soroush/Developer/Projects/tmux-mcp"
default_tools_approval_mode = "approve"
startup_timeout_sec = 10.0
tool_timeout_sec = 60.0
```

The dedicated socket keeps agent-owned sessions separate from normal tmux sessions.

## Example Agent Workflow

```text
1. tmux_create_session(name="app", cwd="/path/to/project")
2. tmux_run_command(target="app", command="npm run dev")
3. tmux_wait_for_output(target="app", text="Local:")
4. tmux_capture_output(target="app", lines=100)
5. tmux_send_keys(target="app", keys=["C-c"])
6. tmux_run_command(target="app", command="npm test")
7. tmux_attach_hint(target="app")
```

Equivalent raw tmux:

```bash
tmux -S /tmp/codex-agent-tmux.sock new-session -d -s app -c "$PWD"
tmux -S /tmp/codex-agent-tmux.sock send-keys -t app 'npm run dev' Enter
tmux -S /tmp/codex-agent-tmux.sock capture-pane -t app -p -S -200
tmux -S /tmp/codex-agent-tmux.sock send-keys -t app C-c
tmux -S /tmp/codex-agent-tmux.sock attach -t app
```

## Tool Reference

### `tmux_create_session`

Creates a detached session.

Inputs:

- `name`: session name
- `cwd`: optional working directory, must be under an allowed root unless `--allow-any-cwd` is set
- `shell`: optional shell path
- `window_name`: optional initial window name
- `command`: optional startup command

Returns the session, cwd, and human attach command.

### `tmux_god_mode_terminal`

Creates a ready terminal for agent work. It returns the first pane id, attach command, optional log path, current output, and suggested next actions.

Use it when the agent needs a durable project terminal quickly.

### `tmux_run_command`

Types a command into an existing pane, presses Enter, waits briefly, and captures output.

Inputs:

- `target`: session, pane id, or `session:window.pane`
- `command`: shell command
- `settle_ms`: short wait before capture
- `capture_lines`: lines to capture
- `allow_dangerous`: bypasses the small destructive-command denylist when explicit user approval exists

### `tmux_send_text`

Sends literal text. Set `enter=true` to press Enter after the text.

Use this for prompts, REPL input, editor commands, and anything that is not a shell command.

### `tmux_send_keys`

Sends special keys:

```text
Enter, Escape, Tab, Space, BSpace, Backspace, Delete,
Up, Down, Left, Right, Home, End, PageUp, PageDown,
C-a through C-z, M-a through M-z, F1 through F12
```

### `tmux_capture_output`

Captures recent visible pane output with `tmux capture-pane`.

### `tmux_wait_for_output`

Polls captured output until text appears or a regex matches.

### `tmux_start_logging` and `tmux_stop_logging`

Uses `tmux pipe-pane` to stream future pane output into a local log file.

### `tmux_attach_hint`

Returns the exact command a human can run to attach to the agent terminal.

### `tmux_kill_target`

Kills a `pane`, `window`, or `session` on the dedicated socket.

## Safety Model

TMUX MCP controls a real shell. That is the point, and also the risk.

The server keeps the interface structured:

- Dedicated tmux socket by default.
- cwd allowlist by default.
- No inherited access to personal tmux sessions.
- JSONL audit log for every tool call.
- Captured output summarized in audit logs by default.
- Optional full-output audit logging with `--audit-include-output`.
- Small denylist for obviously destructive commands in `tmux_run_command`.
- Human attach command returned explicitly.

This does not replace the agent’s normal approval and sandbox rules. `tmux_send_text` can still type arbitrary input into a real terminal. For untrusted repos, run the server inside a container, VM, or low-privilege user.

## Configuration

```bash
tmux-mcp \
  --socket /tmp/codex-agent-tmux.sock \
  --shell /bin/zsh \
  --allowed-root /Users/soroush/Developer/Projects \
  --audit-log ~/.local/state/tmux-mcp/audit.jsonl
```

Options:

| Option | Meaning |
|--------|---------|
| `--tmux <path>` | tmux binary |
| `--socket <path>` | dedicated tmux socket path |
| `--shell <path>` | shell for new sessions |
| `--allowed-root <path>` | repeatable cwd allowlist |
| `--allow-any-cwd` | disable cwd allowlist |
| `--audit-log <path>` | JSONL audit path |
| `--audit-include-output` | include captured text in audit log |
| `--max-capture-lines <n>` | capture limit per call |

## Development

```bash
npm install
npm run build
npm test
npm run lint
npm run check
```

The test suite covers:

- policy validation
- tmux session lifecycle
- command input and capture
- MCP stdio registration
- MCP tool calls end to end
- audit log creation

## Why tmux

tmux already provides the exact primitives agents need:

- sessions, windows, panes
- persistent pseudo-terminals
- detached and attached operation
- key input
- pane capture
- output piping
- human reattachment

TMUX MCP wraps those primitives in a small MCP interface that agents can reason about.

## License

MIT
