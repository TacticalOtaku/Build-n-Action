const PREFIX = "Build-n-Action |";

let debugEnabled = false;

/** Toggle verbose diagnostics (bound to the client "debug" setting). */
export function setDebugLogging(enabled: boolean): void {
  debugEnabled = enabled;
}

/** The module's only way to write to the console: one prefix, and debug output only on request. */
export const log = {
  debug(...args: unknown[]): void {
    if (debugEnabled) console.debug(PREFIX, ...args);
  },
  info(...args: unknown[]): void {
    console.info(PREFIX, ...args);
  },
  warn(...args: unknown[]): void {
    console.warn(PREFIX, ...args);
  },
  error(...args: unknown[]): void {
    console.error(PREFIX, ...args);
  }
};
