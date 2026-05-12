import { mkdir, appendFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { AuditEvent, ServerConfig } from "./types.js";

const REDACTION_PATTERNS = [
  /(gh[opsu]_[A-Za-z0-9_]+)/g,
  /(sk-[A-Za-z0-9_-]+)/g,
  /([A-Za-z0-9_]*TOKEN[A-Za-z0-9_]*=)[^\s]+/gi,
  /([A-Za-z0-9_]*KEY[A-Za-z0-9_]*=)[^\s]+/gi,
  /([A-Za-z0-9_]*SECRET[A-Za-z0-9_]*=)[^\s]+/gi,
];

export class AuditLogger {
  constructor(private readonly config: ServerConfig) {}

  async record(event: AuditEvent): Promise<void> {
    const payload = {
      timestamp: new Date().toISOString(),
      ...event,
    };
    const line = `${redact(JSON.stringify(payload))}\n`;
    await mkdir(dirname(this.config.auditLogPath), { recursive: true });
    await appendFile(this.config.auditLogPath, line, "utf8");
  }

  outputSummary(text: string): Record<string, unknown> {
    const summary: Record<string, unknown> = {
      bytes: Buffer.byteLength(text, "utf8"),
      lines: text.length === 0 ? 0 : text.split("\n").length,
      preview: text.slice(0, 500),
    };
    if (this.config.auditIncludeOutput) {
      summary.text = text;
    }
    return summary;
  }
}

export function redact(value: string): string {
  return REDACTION_PATTERNS.reduce(
    (current, pattern) => current.replace(pattern, (_match, prefix) => `${prefix ?? ""}[REDACTED]`),
    value,
  );
}
