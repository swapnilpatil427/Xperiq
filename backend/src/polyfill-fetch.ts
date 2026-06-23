'use strict';

// @clerk/backend assumes global WHATWG fetch (Node 18+). Polyfill for older Node.
if (typeof globalThis.fetch === 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const undici = require('undici') as typeof import('undici');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const g = globalThis as unknown as Record<string, unknown>;
  g['fetch']    = undici.fetch;
  g['Headers']  = undici.Headers;
  g['Request']  = undici.Request;
  g['Response'] = undici.Response;
  g['FormData'] = undici.FormData;
  if ('File' in undici) g['File'] = (undici as unknown as Record<string, unknown>)['File'];
}
