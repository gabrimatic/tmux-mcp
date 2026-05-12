import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { ServerConfig } from "./types.js";

const DEFAULT_SOCKET = join(tmpdir(), `tmux-mcp-${process.getuid?.() ?? "user"}.sock`);
const DEFAULT_AUDIT_LOG = join(
  process.env.XDG_STATE_HOME ?? join(homedir(), ".local", "state"),
  "tmux-mcp",
  "audit.jsonl",
);

export function defaultConfig(): ServerConfig {
  return {
    tmuxCommand: process.env.TMUX_MCP_TMUX ?? "tmux",
    socketPath: process.env.TMUX_MCP_SOCKET ?? DEFAULT_SOCKET,
    shell: process.env.SHELL ?? "/bin/zsh",
    allowedRoots: [resolve(process.cwd())],
    allowAnyCwd: false,
    auditLogPath: process.env.TMUX_MCP_AUDIT_LOG ?? DEFAULT_AUDIT_LOG,
    auditIncludeOutput: process.env.TMUX_MCP_AUDIT_INCLUDE_OUTPUT === "1",
    maxCaptureLines: 500,
    waitPollMs: 250,
  };
}

export function parseArgs(argv: string[]): ServerConfig {
  const config = defaultConfig();

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      const value = argv[i + 1];
      if (!value) throw new Error(`${arg} requires a value`);
      i += 1;
      return value;
    };

    switch (arg) {
      case "--tmux":
        config.tmuxCommand = next();
        break;
      case "--socket":
      case "--socket-path":
        config.socketPath = next();
        break;
      case "--shell":
        config.shell = next();
        break;
      case "--allowed-root":
        config.allowedRoots.push(resolve(next()));
        break;
      case "--allow-any-cwd":
        config.allowAnyCwd = true;
        break;
      case "--audit-log":
        config.auditLogPath = next();
        break;
      case "--audit-include-output":
        config.auditIncludeOutput = true;
        break;
      case "--max-capture-lines":
        config.maxCaptureLines = Number.parseInt(next(), 10);
        if (!Number.isFinite(config.maxCaptureLines) || config.maxCaptureLines < 1) {
          throw new Error("--max-capture-lines must be a positive integer");
        }
        break;
      case "--help":
      case "-h":
        printHelp();
        process.exit(0);
        return config;
      case "--version":
      case "-v":
        process.stdout.write("0.1.0\n");
        process.exit(0);
        return config;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  config.allowedRoots = [...new Set(config.allowedRoots.map((root) => resolve(root)))];
  return config;
}

function printHelp(): void {
  process.stdout.write(`tmux-mcp

Usage:
  tmux-mcp [options]

Options:
  --tmux <path>               tmux binary to execute
  --socket <path>             dedicated tmux socket path
  --shell <path>              shell used for new sessions
  --allowed-root <path>       allowed cwd root; repeatable
  --allow-any-cwd             allow creating sessions anywhere
  --audit-log <path>          JSONL audit log path
  --audit-include-output      include captured terminal text in audit log
  --max-capture-lines <n>     maximum capture lines per tool call
  --version                   print version
  --help                      print this help
`);
}
