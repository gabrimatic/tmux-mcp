# Repository Guidelines

TMUX MCP is a tmux-backed MCP server that gives agents a persistent, human-attachable terminal.

## Source Of Truth

- Product and setup docs: `README.md`.
- MCP server implementation: `src/server.ts`.
- tmux command wrapper: `src/tmux.ts`.
- Safety and cwd policy: `src/policy.ts`.
- CLI/config parsing: `src/config.ts` and `src/cli.ts`.
- Tests: `tests/*.test.js`.

When behavior changes, update both implementation and the docs that describe the changed behavior.

## Commands

From the repo root:

```bash
npm install
npm run build
npm test
npm run lint
npm run check
```

Use targeted checks for narrow changes, but run `npm run check` before publishing or claiming the repo is ready.

## Implementation Rules

- Keep the MCP surface structured. Prefer explicit terminal operations over a single vague command runner.
- Keep tmux sessions on a dedicated socket by default.
- Validate session names, targets, cwd roots, key names, and capture limits.
- Preserve human attachability for every session workflow.
- Treat `send_text` as powerful real terminal input and document the risk clearly.
- Do not log secrets deliberately. Audit logs should redact common token/key shapes.
- Do not add assistant/provider identity metadata to docs, commits, releases, comments, or generated artifacts.

## Testing Guidance

- Unit tests should cover policy, validation, and config behavior.
- Integration tests should use temporary tmux sockets and clean up sessions.
- MCP tests should use the stdio client and call real tools.
- If tmux is unavailable, state that the tmux integration tests could not run.
