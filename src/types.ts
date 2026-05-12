export type AuditEvent = {
  tool: string;
  input_correlation_id?: string;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  error?: string;
};

export type ServerConfig = {
  tmuxCommand: string;
  socketPath: string;
  shell: string;
  allowedRoots: string[];
  allowAnyCwd: boolean;
  auditLogPath: string;
  auditIncludeOutput: boolean;
  maxCaptureLines: number;
  waitPollMs: number;
};

export type TmuxResult = {
  stdout: string;
  stderr: string;
};

export type SessionInfo = {
  name: string;
  windows: number;
  created: string;
  attached: boolean;
};

export type PaneInfo = {
  session: string;
  windowIndex: number;
  paneIndex: number;
  paneId: string;
  cwd: string;
  command: string;
  active: boolean;
  title: string;
};
