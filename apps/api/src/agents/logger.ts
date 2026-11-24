// Tiny injectable logger. Nest can pass its own Logger (same method names).
export interface AgentLogger {
  log(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

export const silentLogger: AgentLogger = {
  log: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

/** Writes to stderr/stdout streams directly (no console.*). Used by demo.ts. */
export const streamLogger: AgentLogger = {
  log: (m) => void process.stdout.write(`${m}\n`),
  warn: (m) => void process.stderr.write(`[warn] ${m}\n`),
  error: (m) => void process.stderr.write(`[error] ${m}\n`),
};
