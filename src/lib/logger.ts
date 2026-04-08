const isProd = process.env.NODE_ENV === 'production';

export function log(prefix: string, message: string, data?: unknown): void {
  if (isProd) {
    console.log(JSON.stringify({ prefix, message, data, ts: Date.now() }));
  } else {
    console.log(`[${prefix}] ${message}`, data ?? '');
  }
}

export function error(prefix: string, message: string, err?: unknown): void {
  if (isProd) {
    console.error(JSON.stringify({ prefix, message, error: err, ts: Date.now() }));
  } else {
    console.error(`[${prefix}] ${message}`, err ?? '');
  }
}
