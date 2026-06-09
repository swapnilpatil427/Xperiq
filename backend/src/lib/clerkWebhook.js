// Manual Svix webhook signature verification (Clerk uses Svix).
//
// The design doc used the `svix` npm package; it isn't installed here, so we
// implement the documented Svix scheme with built-in crypto:
//   signedContent = `${svixId}.${svixTimestamp}.${rawBody}`
//   expected      = base64( HMAC_SHA256(secretBytes, signedContent) )
// The `svix-signature` header is a space-separated list of `v1,<sig>` entries;
// the request is valid if any entry matches (constant-time).
const crypto = require('crypto');

const TOLERANCE_SECONDS = 5 * 60;

/**
 * Verify a Svix-signed webhook.
 * @param {Buffer|string} rawBody  the exact raw request body
 * @param {object} headers         req.headers (lowercased keys)
 * @param {string} secret          CLERK_WEBHOOK_SECRET (whsec_… or raw base64)
 * @returns {boolean}
 */
function verifySvixSignature(rawBody, headers, secret) {
  if (!secret) return false;
  const id = headers['svix-id'];
  const timestamp = headers['svix-timestamp'];
  const signatureHeader = headers['svix-signature'];
  if (!id || !timestamp || !signatureHeader) return false;

  // Reject stale timestamps (replay protection).
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > TOLERANCE_SECONDS) return false;

  const body = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody);
  const signedContent = `${id}.${timestamp}.${body}`;

  // Secret is base64 after the optional "whsec_" prefix.
  const secretBytes = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const expected = crypto.createHmac('sha256', secretBytes).update(signedContent).digest('base64');
  const expectedBuf = Buffer.from(expected);

  for (const part of signatureHeader.split(' ')) {
    const sig = part.includes(',') ? part.split(',')[1] : part;
    const sigBuf = Buffer.from(sig);
    if (sigBuf.length === expectedBuf.length && crypto.timingSafeEqual(sigBuf, expectedBuf)) {
      return true;
    }
  }
  return false;
}

module.exports = { verifySvixSignature };
