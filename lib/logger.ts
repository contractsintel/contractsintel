// Lightweight structured logger. In production, logs are JSON for
// machine parsing. In development, logs are human-readable.
// Replaces raw console.log across the codebase.

const isProd = process.env.NODE_ENV === "production";

type LogLevel = "debug" | "info" | "warn" | "error";

function log(level: LogLevel, message: string, meta?: Record<string, any>) {
  if (isProd) {
    const entry = { level, message, ts: new Date().toISOString(), ...meta };
    if (level === "error") {
      console.error(JSON.stringify(entry));
    } else if (level === "warn") {
      console.warn(JSON.stringify(entry));
    } else {
      console.log(JSON.stringify(entry));
    }
  } else {
    const prefix = `[${level.toUpperCase()}]`;
    if (meta && Object.keys(meta).length > 0) {
      console[level === "error" ? "error" : level === "warn" ? "warn" : "log"](
        prefix, message, meta,
      );
    } else {
      console[level === "error" ? "error" : level === "warn" ? "warn" : "log"](
        prefix, message,
      );
    }
  }
}

export const logger = {
  debug: (msg: string, meta?: Record<string, any>) => log("debug", msg, meta),
  info: (msg: string, meta?: Record<string, any>) => log("info", msg, meta),
  warn: (msg: string, meta?: Record<string, any>) => log("warn", msg, meta),
  error: (msg: string, meta?: Record<string, any>) => log("error", msg, meta),
};
