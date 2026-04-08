/**
 * Worker stub — BullMQ removed.
 * Jobs now run directly via jobs.ts. This file is kept as a no-op
 * so existing imports don't break.
 */

import { log } from '../logger';

export function startWorker(): void {
  log('Worker', 'No-op — BullMQ removed, jobs run inline via jobs.ts');
}
