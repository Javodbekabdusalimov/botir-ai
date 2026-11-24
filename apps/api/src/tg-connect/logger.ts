// Tiny logger (no console.log in prod). Never pass secrets/session/codes here.
type Level = 'info' | 'warn' | 'error';

export interface Logger {
  info(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
}

export function createLogger(scope: string): Logger {
  const write = (level: Level, msg: string): void => {
    const line = `${new Date().toISOString()} [${level}] [${scope}] ${msg}\n`;
    (level === 'info' ? process.stdout : process.stderr).write(line);
  };
  return {
    info: (m) => write('info', m),
    warn: (m) => write('warn', m),
    error: (m) => write('error', m),
  };
}

export const errMsg = (e: unknown): string => (e instanceof Error ? e.message : String(e));
