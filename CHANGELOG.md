# Changelog

## 0.2.0 - 2026-10-15

- Migrated to the v2 MCP TypeScript SDK (`@modelcontextprotocol/server`). Tool names, inputs, and outputs are unchanged; protocol versions back to 2024-11-05 still negotiate.
- `--version` and the MCP server info now report the real package version.
- Installable from GitHub with `npm install -g github:gabrimatic/tmux-mcp#v0.2.0`; the build runs on install.
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
