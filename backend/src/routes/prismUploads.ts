// Prism — file UPLOAD ingress: POST /api/prism/uploads?filename={name}
//
// The file-upload path of the connection flow: a CSV/XLSX/SPSS/JSON export is POSTed as
// RAW bytes, parked in the upload store (../lib/prism/uploads), and the returned
// fileRef is later passed to POST /api/prism/connections ({ authKind:'file_upload',
// fileRef }) → EXTRACT's parseFile resolves the bytes back via readUpload.
//
// Mounted in index.ts with express.raw (wildcard MIME) BEFORE express.json (the
// Clerk/Stripe/prism-webhook pattern) so the JSON parser never consumes the file stream.
// requireAuth is applied INSIDE the router (sibling style) — org_id always from the
// Clerk token (req.orgId), NEVER from body/query/header.
//
// Contract (FE codes against this — keep exact):
//   POST /api/prism/uploads?filename={name}
//   body = raw file bytes
//   → 201 { fileRef, filename, sizeBytes, detectedFormat, detectedPlatform }
//   fileRef = prism-upload scheme URL with org_id, uuid, safeName
import express from 'express';
import type { Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/requireRole';
import logger from '../lib/logger';
import { serverError, clientError } from '../lib/httpError';
import { putUpload, safeFilename, detectFormat, detectPlatform } from '../lib/prism/uploads';

const router = express.Router();

/** Hard ceiling mirrored from PRISM_UPLOAD_MAX_MB (default 60) for an early 413. */
function maxBytes(): number {
  const mb = Number(process.env.PRISM_UPLOAD_MAX_MB ?? 60);
  const safe = Number.isFinite(mb) && mb > 0 ? mb : 60;
  return safe * 1024 * 1024;
}

// POST /api/prism/uploads?filename=... — store raw upload bytes, return the fileRef.
router.post('/', requireAuth, requireRole('analyst'), async (req: Request, res: Response): Promise<void> => {
  const orgId = req.orgId;
  try {
    // express.raw gives us req.body as a Buffer. A non-Buffer means the wrong body
    // parser ran (mis-mount) or an empty/streamed body.
    const buf: Buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');
    if (buf.length === 0) {
      clientError(res, 400, 'Empty upload body — POST the raw file bytes.');
      return;
    }

    const cap = maxBytes();
    if (buf.length > cap) {
      clientError(res, 413, `Upload exceeds the ${Math.round(cap / (1024 * 1024))}MB limit.`);
      return;
    }

    const rawName = (req.query.filename as string | undefined) ?? 'upload.dat';
    const filename = safeFilename(rawName);
    const detectedFormat = detectFormat(filename);
    // Best-effort source-platform sniff (qualtrics/surveymonkey/typeform/spss/generic/unknown).
    // Reads only the first ~2 KB for CSV/JSON, not the whole buffer.
    const detectedPlatform = detectPlatform(filename, buf);

    const fileRef = await putUpload(orgId, filename, buf);

    res.status(201).json({ fileRef, filename, sizeBytes: buf.length, detectedFormat, detectedPlatform });
  } catch (err: unknown) {
    // putUpload throws a 413-tagged error when over the cap (race with the early check).
    const status = (err as { status?: number })?.status;
    if (status === 413) {
      clientError(res, 413, 'Upload exceeds the size limit.');
      logger.warn({ orgId }, 'prism:upload_too_large');
      return;
    }
    serverError(res, err instanceof Error ? err : new Error(String(err)), { orgId, route: 'prism:upload' });
  }
});

export default router;
