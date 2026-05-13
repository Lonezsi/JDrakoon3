const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const;
type LogLevel = typeof LOG_LEVELS[number];

const currentLevel: LogLevel = (process.env.LOG_LEVEL as LogLevel) || 'info';

function log(level: LogLevel, ...args: any[]) {
  if (LOG_LEVELS.indexOf(level) >= LOG_LEVELS.indexOf(currentLevel)) {
    console[level === 'debug' ? 'log' : level](`[${level.toUpperCase()}]`, ...args);
  }
}

export default {
  debug: (...args: any[]) => log('debug', ...args),
  info: (...args: any[]) => log('info', ...args),
  warn: (...args: any[]) => log('warn', ...args),
  error: (...args: any[]) => log('error', ...args),
};
