/**
 * Prism — Secret Manager (credential storage).
 *
 * Source credentials (API tokens, OAuth refresh tokens, `.p8` keys, SA JSON) are class
 * `secret` (security-compliance.md §1): Secret Manager ONLY — never in Postgres, logs,
 * exports, the client, or LLM payloads. `prism_connections` holds only an opaque
 * `credential_ref`; the secret value is NEVER returned to the frontend.
 *
 * Envelope encryption & per-org key hierarchy (security-compliance.md §2.2):
 *
 *   KMS root (CMK, never exported) ──► per-org KEK (KMS-resident, rotation-versioned)
 *      │ wraps/unwraps (envelope)
 *      ▼ DEK (random, per-secret) ──AES-256-GCM (AAD = org_id|connection_id|kek_version)──► ciphertext
 *   Secret Manager entry, org-namespaced path  prism/{org_id}/conn/{connection_id}
 *      value = { ciphertext, wrapped_dek, kek_version, alg, aad }
 *
 * - Per-secret DEK wrapped by the org's KEK; store only ciphertext + wrapped_dek +
 *   kek_version (never plaintext or KEK).
 * - AAD binds ciphertext to org_id|connection_id|kek_version so a ciphertext lifted into
 *   another org's path fails GCM auth — cross-tenant substitution is CRYPTOGRAPHICALLY
 *   rejected (security-compliance.md §2.2, §3.4 secret-resolution test).
 * - Org-namespaced path; the resolver asserts the path prefix == the caller's org_id.
 *
 * Backend selected by `PRISM_SECRETS_BACKEND`:
 *   'local' (default; dev)  → encrypted-file / in-memory envelope with a local dev master key
 *   'gcp_secret_manager'    → GCP Secret Manager + Cloud KMS (stub — wired when the dep lands)
 */
import crypto from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import logger from '../logger';

// ─────────────────────────────────────────────────────────────────────────────
// Public interface
// ─────────────────────────────────────────────────────────────────────────────

/** Opaque reference persisted on prism_connections.credential_ref — never the secret. */
export type CredentialRef = string;

/** Encrypted envelope record stored at an org-namespaced path. */
export interface SecretEnvelope {
  ciphertext:  string;   // base64 — AES-256-GCM(secret) under the DEK
  wrapped_dek: string;   // base64 — DEK wrapped by the org KEK (KMS in prod)
  iv:          string;   // base64 — GCM nonce
  tag:         string;   // base64 — GCM auth tag
  kek_version: number;   // org KEK version used (rotation-aware)
  alg:         'AES-256-GCM';
  aad:         string;   // org_id|connection_id|kek_version (the bound tuple)
}

export interface PutSecretInput {
  orgId:        string;
  connectionId: string;
  /** Raw secret material (token / refresh token / SA JSON / .p8). Held in memory only. */
  secret:       string;
}

export interface PrismSecretManager {
  /** Encrypt + store a secret; returns the opaque ref to persist on the connection. */
  putSecret(input: PutSecretInput): Promise<CredentialRef>;
  /** Deterministic, org-namespaced ref for (org, connection) — never embeds the secret. */
  getSecretRef(orgId: string, connectionId: string): CredentialRef;
  /** Resolve + decrypt at use; asserts the ref's org prefix == caller org. */
  getSecret(orgId: string, ref: CredentialRef): Promise<string>;
  /** Revoke/delete the secret (one-click revoke → fail-closed downstream). */
  deleteSecret(orgId: string, ref: CredentialRef): Promise<void>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared helpers — path namespacing + AAD binding + tenant assertion
// ─────────────────────────────────────────────────────────────────────────────

/** Org-namespaced SM path: prism/{org_id}/conn/{connection_id} (security-compliance.md §2.2). */
export function secretPath(orgId: string, connectionId: string): string {
  return `prism/${orgId}/conn/${connectionId}`;
}

/** AAD = org_id|connection_id|kek_version — binds ciphertext to its tenant + key version. */
function buildAad(orgId: string, connectionId: string, kekVersion: number): Buffer {
  return Buffer.from(`${orgId}|${connectionId}|${kekVersion}`, 'utf8');
}

/**
 * Assert a ref belongs to the caller's org (path-prefix check, §2.4 / §3.4).
 * A miss throws — the resolver rejects another org's credential_ref before any unwrap.
 */
function assertOrgPrefix(orgId: string, ref: CredentialRef): void {
  const expected = `prism/${orgId}/`;
  if (!ref.startsWith(expected)) {
    throw new Error('secretManager: credential_ref does not belong to this org');
  }
}

/** Parse a ref back into (orgId, connectionId) for AAD reconstruction. */
function parseRef(ref: CredentialRef): { orgId: string; connectionId: string } {
  // prism/{org_id}/conn/{connection_id}
  const m = /^prism\/([^/]+)\/conn\/([^/]+)$/.exec(ref);
  if (!m) throw new Error('secretManager: malformed credential_ref');
  return { orgId: m[1], connectionId: m[2] };
}

// ─────────────────────────────────────────────────────────────────────────────
// LOCAL backend — envelope encryption with a local dev master key.
//
// Mirrors the prod envelope shape (DEK per secret, KEK-wrapped, GCM + AAD) using a
// local "KEK" derived from PRISM_LOCAL_MASTER_KEY (dev only). Persists envelopes to an
// encrypted file under TMPDIR/scratch so a dev restart keeps connections working;
// falls back to in-memory if the dir is unwritable. NEVER for production secrets.
// ─────────────────────────────────────────────────────────────────────────────

class LocalSecretManager implements PrismSecretManager {
  private readonly kekVersion = 1;
  private readonly store = new Map<string, SecretEnvelope>();
  private readonly filePath: string;
  private loaded = false;

  constructor() {
    const dir = process.env.TMPDIR ?? '/tmp';
    this.filePath = path.join(dir, 'prism-secrets.local.json');
  }

  /** Derive the local KEK from a dev master key (32 bytes). Dev-only key derivation. */
  private localKek(): Buffer {
    const master = process.env.PRISM_LOCAL_MASTER_KEY
      ?? 'prism-local-dev-master-key-change-me';
    // scrypt → 32-byte KEK; static salt is acceptable for a single-tenant dev key.
    return crypto.scryptSync(master, 'prism-local-kek-v1', 32);
  }

  private async load(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    try {
      const raw = await fs.readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(raw) as Record<string, SecretEnvelope>;
      for (const [k, v] of Object.entries(parsed)) this.store.set(k, v);
    } catch {
      // No file yet (or unreadable) → start empty / in-memory.
    }
  }

  private async persist(): Promise<void> {
    const obj: Record<string, SecretEnvelope> = {};
    for (const [k, v] of this.store) obj[k] = v;
    await fs.writeFile(this.filePath, JSON.stringify(obj), { mode: 0o600 }).catch((err: unknown) => {
      logger.warn({ err: (err as Error).message }, 'prism:secretManager:local persist failed (in-memory only)');
    });
  }

  /** Wrap a per-secret DEK under the local KEK (envelope outer layer). */
  private wrapDek(dek: Buffer): string {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.localKek(), iv);
    const wrapped = Buffer.concat([cipher.update(dek), cipher.final()]);
    const tag = cipher.getAuthTag();
    // pack iv|tag|wrapped so unwrap is self-contained
    return Buffer.concat([iv, tag, wrapped]).toString('base64');
  }

  private unwrapDek(wrapped: string): Buffer {
    const buf = Buffer.from(wrapped, 'base64');
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const ct = buf.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.localKek(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]);
  }

  async putSecret({ orgId, connectionId, secret }: PutSecretInput): Promise<CredentialRef> {
    await this.load();
    const ref = secretPath(orgId, connectionId);
    const dek = crypto.randomBytes(32);                 // per-secret DEK
    const iv = crypto.randomBytes(12);
    const aad = buildAad(orgId, connectionId, this.kekVersion);
    const cipher = crypto.createCipheriv('aes-256-gcm', dek, iv);
    cipher.setAAD(aad);
    const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();

    this.store.set(ref, {
      ciphertext:  ciphertext.toString('base64'),
      wrapped_dek: this.wrapDek(dek),
      iv:          iv.toString('base64'),
      tag:         tag.toString('base64'),
      kek_version: this.kekVersion,
      alg:         'AES-256-GCM',
      aad:         aad.toString('utf8'),
    });
    dek.fill(0); // zero the DEK after use (request-scoped memory hygiene)
    await this.persist();
    return ref;
  }

  getSecretRef(orgId: string, connectionId: string): CredentialRef {
    return secretPath(orgId, connectionId);
  }

  async getSecret(orgId: string, ref: CredentialRef): Promise<string> {
    assertOrgPrefix(orgId, ref);
    await this.load();
    const env = this.store.get(ref);
    if (!env) throw new Error('secretManager: secret not found');
    const { connectionId } = parseRef(ref);
    const dek = this.unwrapDek(env.wrapped_dek);
    try {
      const decipher = crypto.createDecipheriv('aes-256-gcm', dek, Buffer.from(env.iv, 'base64'));
      // Reconstruct AAD from the resolving org — a lifted ciphertext fails GCM auth here.
      decipher.setAAD(buildAad(orgId, connectionId, env.kek_version));
      decipher.setAuthTag(Buffer.from(env.tag, 'base64'));
      const plain = Buffer.concat([
        decipher.update(Buffer.from(env.ciphertext, 'base64')),
        decipher.final(),
      ]);
      return plain.toString('utf8');
    } finally {
      dek.fill(0);
    }
  }

  async deleteSecret(orgId: string, ref: CredentialRef): Promise<void> {
    assertOrgPrefix(orgId, ref);
    await this.load();
    this.store.delete(ref);
    await this.persist();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GCP backend — stub. Wired to @google-cloud/secret-manager + Cloud KMS when the dep
// lands (no new npm dep added in this PR). Same interface + envelope shape (§2.2):
// SM stores { ciphertext, wrapped_dek, kek_version, alg, aad }; KMS wraps/unwraps the DEK
// under the per-org KEK; AAD = org_id|connection_id|kek_version; unwrap-on-use only.
// ─────────────────────────────────────────────────────────────────────────────

class GcpSecretManager implements PrismSecretManager {
  // TODO(verify): bind to @google-cloud/secret-manager + @google-cloud/kms. Path
  // prism/{org_id}/conn/{connection_id}; per-org KEK resource id from config; KMS
  // Encrypt/Decrypt for DEK wrap/unwrap with additionalAuthenticatedData = the AAD tuple.
  putSecret(_input: PutSecretInput): Promise<CredentialRef> {
    return Promise.reject(new Error('GcpSecretManager.putSecret not implemented — set PRISM_SECRETS_BACKEND=local for dev'));
  }
  getSecretRef(orgId: string, connectionId: string): CredentialRef {
    return secretPath(orgId, connectionId);
  }
  getSecret(_orgId: string, _ref: CredentialRef): Promise<string> {
    return Promise.reject(new Error('GcpSecretManager.getSecret not implemented'));
  }
  deleteSecret(_orgId: string, _ref: CredentialRef): Promise<void> {
    return Promise.reject(new Error('GcpSecretManager.deleteSecret not implemented'));
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Backend selection (singleton)
// ─────────────────────────────────────────────────────────────────────────────

function makeSecretManager(): PrismSecretManager {
  const backend = process.env.PRISM_SECRETS_BACKEND ?? 'local';
  if (backend === 'gcp_secret_manager') {
    logger.info('prism:secretManager backend=gcp_secret_manager');
    return new GcpSecretManager();
  }
  if (backend !== 'local') {
    logger.warn({ backend }, 'prism:secretManager unknown PRISM_SECRETS_BACKEND — falling back to local');
  }
  return new LocalSecretManager();
}

export const secretManager: PrismSecretManager = makeSecretManager();
export default secretManager;
