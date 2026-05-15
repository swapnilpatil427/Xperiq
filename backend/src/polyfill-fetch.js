'use strict';

/**
 * @clerk/backend assumes global WHATWG fetch (Node 18+). Older Node versions need this
 * before any Clerk (or other) code runs.
 */
if (typeof globalThis.fetch === 'undefined') {
  const undici = require('undici');
  globalThis.fetch = undici.fetch;
  globalThis.Headers = undici.Headers;
  globalThis.Request = undici.Request;
  globalThis.Response = undici.Response;
  globalThis.FormData = undici.FormData;
  if (undici.File) globalThis.File = undici.File;
}
