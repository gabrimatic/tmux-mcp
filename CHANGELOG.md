# Changelog

## Unreleased

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
