// Standalone Event Engine entry point — the deployable background processor.
//
//   node src/eventEngine/index.js     (or: npm run start:event-engine)
//
// Shares the backend's DATABASE_URL / REDIS_URL and library code (no separate
// node_modules). Runs no HTTP server — pure stream processing. Can also be run
// in-process from index.js via ENABLE_EVENT_ENGINE=true for local dev.
'use strict';

import '../env';

import * as processor from './processor';

function log(msg: string, obj: Record<string, unknown> = {}): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    (require('../lib/logger') as { info: (obj: Record<string, unknown>, msg: string) => void }).info(obj, msg);
  } catch {
    console.log(`[event-engine] ${msg}`, obj);
  }
}

processor.start({ consumer: `event-engine-${process.pid}` }).catch((err: unknown) => {
  const error = err instanceof Error ? err : new Error(String(err));
  console.error('[event-engine] fatal:', error.message);
  process.exit(1);
});

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => { log('shutting down'); processor.stop(); setTimeout(() => process.exit(0), 500); });
}
