# Changelog

## 0.2.2 - 2026-10-15

- `tmux_send_text` and `tmux_run_command` now type text that starts with `-` literally instead of tmux reading it as flags.
- A trailing `;` in sent text, startup commands, window names, or paths is no longer dropped or treated as a tmux command separator.
- The `tmux-mcp://audit/{tail}` resource falls back to 100 lines when `tail` is not a number instead of returning the whole log.

## 0.2.1 - 2026-10-15

- README Quick Start now installs from npm: `npm install -g @gabrimatic/tmux-mcp`.
- Normalized the `bin` path to `dist/src/cli.js` (no leading `./`) so npm no longer warns at publish time. No behavior change; the `tmux-mcp` command is the same.

## 0.2.0 - 2026-10-15

- Migrated to the v2 MCP TypeScript SDK (`@modelcontextprotocol/server`). Tool names, inputs, and outputs are unchanged; protocol versions back to 2024-11-05 still negotiate.
- `--version` and the MCP server info now report the real package version.
- Prebuilt tarball attached to the GitHub release.
- Builds with TypeScript 7; dependencies brought to current releases (zod 4.6, eslint 10.12, typescript-eslint 8.71, @types/node 26).
- Shipped package now includes the changelog and excludes stale build output.
- Fixed the npm executable path so the published `tmux-mcp` bin points at the built CLI.
- Restricted pane log paths to allowed roots unless `--allow-any-cwd` is set.
- Applied the dangerous-command policy to startup `command` fields.
- Validated shell overrides as absolute paths.
- Made explicit `--allowed-root` values replace the implicit startup cwd allowlist.
- Added packaging, config, path-policy, and MCP safety regression tests.

## 0.1.0

- Initial tmux-backed stdio MCP server.
- Added persistent session, pane, key input, capture, wait, logging, attach, interrupt, and cleanup tools.
- Added cwd allowlist, dedicated socket support, command policy checks, and JSONL audit logging.
