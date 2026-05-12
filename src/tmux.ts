import { execFile } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { promisify } from "node:util";
import type { PaneInfo, ServerConfig, SessionInfo, TmuxResult } from "./types.js";
import { assertCwdAllowed, assertSessionName, assertTarget } from "./policy.js";

const execFileAsync = promisify(execFile);

export class TmuxController {
  constructor(private readonly config: ServerConfig) {}

  async ensureSocketDirectory(): Promise<void> {
    await mkdir(dirname(this.config.socketPath), { recursive: true });
  }

  async exec(args: string[], timeoutMs = 10000): Promise<TmuxResult> {
    await this.ensureSocketDirectory();
    try {
      const { stdout, stderr } = await execFileAsync(
        this.config.tmuxCommand,
        ["-S", this.config.socketPath, ...args],
        {
          timeout: timeoutMs,
          maxBuffer: 10 * 1024 * 1024,
          encoding: "utf8",
        },
      );
      return { stdout, stderr };
    } catch (error: any) {
      const stderr = error?.stderr ? String(error.stderr) : "";
      const stdout = error?.stdout ? String(error.stdout) : "";
      const message = stderr.trim() || stdout.trim() || error?.message || "tmux command failed";
      throw new Error(message);
    }
  }

  async createSession(input: {
    name: string;
    cwd?: string;
    shell?: string;
    windowName?: string;
    command?: string;
  }): Promise<{ session: string; cwd: string; attachCommand: string }> {
    assertSessionName(input.name);
    const cwd = assertCwdAllowed(input.cwd ?? process.cwd(), this.config);
    const shell = input.shell ?? this.config.shell;
    const args = ["new-session", "-d", "-s", input.name, "-c", cwd];
    if (input.windowName) args.push("-n", input.windowName);
    args.push(input.command ? `${shellQuote(shell)} -lc ${shellQuote(`${input.command}; exec ${shellQuote(shell)}`)}` : shell);
    await this.exec(args);
    return {
      session: input.name,
      cwd,
      attachCommand: this.attachCommand(input.name),
    };
  }

  async listSessions(): Promise<SessionInfo[]> {
    const sep = "|";
    const format = ["#{session_name}", "#{session_windows}", "#{session_created_string}", "#{session_attached}"].join(sep);
    try {
      const { stdout } = await this.exec(["list-sessions", "-F", format]);
      return stdout
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => {
          const [name, windows, created, attached] = line.split(sep);
          return { name, windows: Number(windows), created, attached: attached !== "0" };
        });
    } catch (error: any) {
      if (String(error.message).includes("no server running")) return [];
      throw error;
    }
  }

  async listPanes(target?: string): Promise<PaneInfo[]> {
    if (target) assertTarget(target);
    const sep = "|";
    const allForSession = Boolean(target && !target.includes(":") && !target.startsWith("%"));
    const format = [
      "#{session_name}",
      "#{window_index}",
      "#{pane_index}",
      "#{pane_id}",
      "#{pane_current_path}",
      "#{pane_current_command}",
      "#{pane_active}",
      "#{pane_title}",
    ].join(sep);
    const args = target && !allForSession ? ["list-panes", "-t", target, "-F", format] : ["list-panes", "-a", "-F", format];
    const { stdout } = await this.exec(args);
    const panes = stdout
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [session, windowIndex, paneIndex, paneId, cwd, command, active, title] = line.split(sep);
        return {
          session,
          windowIndex: Number(windowIndex),
          paneIndex: Number(paneIndex),
          paneId,
          cwd,
          command,
          active: active === "1",
          title,
        };
      });
    return allForSession ? panes.filter((pane) => pane.session === target) : panes;
  }

  async createWindow(input: { target: string; name?: string; cwd?: string; command?: string }): Promise<void> {
    assertTarget(input.target);
    const args = ["new-window", "-t", input.target];
    if (input.name) args.push("-n", input.name);
    if (input.cwd) args.push("-c", assertCwdAllowed(input.cwd, this.config));
    if (input.command) args.push(input.command);
    await this.exec(args);
  }

  async splitPane(input: { target: string; cwd?: string; horizontal?: boolean; percent?: number; command?: string }): Promise<void> {
    assertTarget(input.target);
    const args = ["split-window", "-t", input.target];
    args.push(input.horizontal ? "-h" : "-v");
    if (input.percent) args.push("-p", String(input.percent));
    if (input.cwd) args.push("-c", assertCwdAllowed(input.cwd, this.config));
    if (input.command) args.push(input.command);
    await this.exec(args);
  }

  async sendText(target: string, text: string, enter = false): Promise<void> {
    assertTarget(target);
    await this.exec(["send-keys", "-t", target, "-l", text]);
    if (enter) await this.sendKeys(target, ["Enter"]);
  }

  async sendKeys(target: string, keys: string[]): Promise<void> {
    assertTarget(target);
    validateKeys(keys);
    await this.exec(["send-keys", "-t", target, ...keys]);
  }

  async capture(target: string, lines: number, includeEscapes = false): Promise<string> {
    assertTarget(target);
    const clamped = Math.max(1, Math.min(lines, this.config.maxCaptureLines));
    const args = ["capture-pane", "-t", target, "-p", "-J", "-S", `-${clamped}`];
    if (includeEscapes) args.splice(1, 0, "-e");
    const { stdout } = await this.exec(args);
    return stdout;
  }

  async resizePane(target: string, direction: "up" | "down" | "left" | "right", cells: number): Promise<void> {
    assertTarget(target);
    const flag = { up: "-U", down: "-D", left: "-L", right: "-R" }[direction];
    await this.exec(["resize-pane", "-t", target, flag, String(cells)]);
  }

  async startLogging(target: string, path: string): Promise<void> {
    assertTarget(target);
    await mkdir(dirname(path), { recursive: true });
    await this.exec(["pipe-pane", "-t", target, "-o", `cat >> ${shellQuote(path)}`]);
  }

  async stopLogging(target: string): Promise<void> {
    assertTarget(target);
    await this.exec(["pipe-pane", "-t", target]);
  }

  async killTarget(kind: "pane" | "window" | "session", target: string): Promise<void> {
    assertTarget(target);
    const command = kind === "session" ? "kill-session" : kind === "window" ? "kill-window" : "kill-pane";
    await this.exec([command, "-t", target]);
  }

  attachCommand(target: string): string {
    assertTarget(target);
    return `${shellQuote(this.config.tmuxCommand)} -S ${shellQuote(this.config.socketPath)} attach -t ${shellQuote(target)}`;
  }
}

function validateKeys(keys: string[]): void {
  const allowed = /^(Enter|Escape|Tab|Space|BSpace|Backspace|Delete|Up|Down|Left|Right|Home|End|PageUp|PageDown|C-[A-Za-z]|M-[A-Za-z]|F([1-9]|1[0-2]))$/;
  for (const key of keys) {
    if (!allowed.test(key)) {
      throw new Error(`Unsupported key: ${key}`);
    }
  }
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}
