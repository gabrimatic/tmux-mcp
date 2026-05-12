# Security Policy

TMUX MCP gives an MCP client structured control over a real tmux-backed shell. Treat it as powerful local terminal access.

## Supported Versions

Security fixes target the latest released version.

## Reporting

Please report security issues privately to the repository owner instead of opening a public issue.

## Operating Safely

- Use a dedicated tmux socket.
- Restrict cwd with `--allowed-root`.
- Avoid forwarding secrets into the MCP server environment.
- Keep audit logs local and reviewable.
- Use containers, VMs, or low-privilege users for untrusted repositories.
- Keep normal agent approval flows enabled for destructive actions.

The built-in denylist catches only a small set of obviously dangerous `run_command` patterns. It is not a sandbox.
