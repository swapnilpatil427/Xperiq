// Standalone Event Engine entry point — the deployable background processor.
//
//   node src/eventEngine/index.js     (or: npm run start:event-engine)
//
// Shares the backend's DATABASE_URL / REDIS_URL and library code (no separate
// node_modules). Runs no HTTP server — pure stream processing. Can also be run
// in-process from index.js via ENABLE_EVENT_ENGINE=true for local dev.
'use strict';

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });
require('dotenv').config();

const processor = require('./processor');

function log(msg, obj = {}) {
  try { require('../lib/logger').info(obj, msg); } catch { console.log(`[event-engine] ${msg}`, obj); }
}

processor.start({ consumer: `event-engine-${process.pid}` }).catch((err) => {
  console.error('[event-engine] fatal:', err.message);
  process.exit(1);
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => { log('shutting down'); processor.stop(); setTimeout(() => process.exit(0), 500); });
}
