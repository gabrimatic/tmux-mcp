import { resolve, relative } from "node:path";
import type { ServerConfig } from "./types.js";

const SESSION_RE = /^[A-Za-z0-9_.-]{1,80}$/;
const TARGET_RE = /^(%[0-9]+|[A-Za-z0-9_.-]{1,80}(:[A-Za-z0-9_.-]{1,80}(\.[0-9]+)?)?)$/;
const DANGEROUS_COMMANDS = [
  /\brm\s+(-[^\n]*r[^\n]*f|-[^\n]*f[^\n]*r)\s+(\/|~|\$HOME)(\s|$)/i,
  /\bsudo\s+rm\s+/i,
  /\bdiskutil\s+(erase|partition|apfs\s+delete)/i,
  /\bmkfs(\.| |$)/i,
  /\bdd\s+.*\bof=\/dev\//i,
  /\bchmod\s+-R\s+777\s+(\/|~|\$HOME)(\s|$)/i,
  /\blaunchctl\s+(bootout|remove|unload)\b/i,
];

export function assertSessionName(name: string): void {
  if (!SESSION_RE.test(name)) {
    throw new Error("Session names may only contain letters, numbers, dot, dash, and underscore.");
  }
}

export function assertTarget(target: string): void {
  if (!TARGET_RE.test(target)) {
    throw new Error("Invalid tmux target. Use a listed session name, session:window.pane, or %pane_id.");
  }
}

export function assertCwdAllowed(cwd: string, config: ServerConfig): string {
  const resolved = resolve(cwd);
  if (config.allowAnyCwd) return resolved;

  const allowed = config.allowedRoots.some((root) => {
    const rel = relative(resolve(root), resolved);
    return rel === "" || (!rel.startsWith("..") && !resolve(rel).startsWith(".."));
  });

  if (!allowed) {
    throw new Error(`cwd is outside allowed roots: ${resolved}`);
  }
  return resolved;
}

export function commandRisk(command: string): string[] {
  const risks: string[] = [];
  for (const pattern of DANGEROUS_COMMANDS) {
    if (pattern.test(command)) {
      risks.push(`matched dangerous command policy: ${pattern.source}`);
    }
  }
  return risks;
}

export function assertCommandAllowed(command: string, allowDangerous: boolean): void {
  const risks = commandRisk(command);
  if (risks.length > 0 && !allowDangerous) {
    throw new Error(`Command blocked by safety policy. Set allow_dangerous=true only with explicit user approval. ${risks.join("; ")}`);
  }
}
