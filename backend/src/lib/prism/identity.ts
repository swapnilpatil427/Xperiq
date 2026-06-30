/**
 * Prism IDENTITY — reversible cross-source identity resolution (I6 / ADR-024).
 *
 * "Unify so Crystal reasons across sources" needs a respondent/identity graph.
 * This module is that graph. Per architecture-review.md §I6 and the DDL header in
 * supabase/migrations/20260629120100_prism_sync_and_identity.sql:
 *
 *   - Identities are LINKED via evidence edges, NEVER destructively merged. A link
 *     can always be un-done (drop an edge) — critical for corrections and GDPR
 *     (erase ONE source identity without nuking the whole cluster).
 *   - Matching is deterministic-first: normalized email → phone → external_id
 *     (exact, confidence 1.0). Only the residual falls through to a probabilistic
 *     fuzzy match (name + org + locale, scored 0..1). Low-confidence matches are
 *     PROPOSED (needs_confirmation), never silently auto-merged (Principle 1).
 *   - `xperiq_person_id` is DERIVED, not stored authoritatively: it is the canonical
 *     id (min identity_key) of the CONNECTED COMPONENT a person belongs to over the
 *     `prism_identity_edges` undirected graph. We compute it with a recursive CTE
 *     over the edge set; reversing an edge can SPLIT a component, so we recompute
 *     the affected component rather than mutating any stored canonical id.
 *   - Survivorship rules build the unified profile by source-of-record precedence
 *     per field — the cluster has many source identities; the profile is one view.
 *
 * ── WHERE THE ENGINE WIRES THIS IN (documented; engine files NOT edited here) ──
 * The identity_key of a record is its normalized strongest identifier (the same
 * priority resolveIdentity uses). The engine should call into this module on the
 * TRANSFORM→LOAD seam:
 *
 *   • TRANSFORM (backend/src/lib/prism/transform.ts): when building each StagedRow's
 *     `respondent`, derive the candidate { email, phone, externalId, name, ... } from
 *     the raw payload and call `resolveIdentity(orgId, candidate)`. Stamp the returned
 *     `xperiq_person_id` (+ matched/confidence/evidence) into `metadata.prism.identity`
 *     so lineage carries it (the resolved id is "stamped into lineage like every other
 *     node"). A `needs_confirmation` result must NOT auto-link — surface it as a
 *     proposal (the propose→confirm seam) before any `addEdge` is written.
 *
 *   • LOAD (backend/src/lib/prism/load.ts): after a batch upserts canonical rows, for
 *     each DETERMINISTIC (confidence 1.0) cross-source match, call
 *     `addEdge(orgId, personA, personB, evidence, 1.0)` to grow the reversible graph.
 *     Probabilistic edges are written only on explicit user confirmation of the
 *     proposal emitted during TRANSFORM (confirmed=true).
 *
 * RULES honored: TS strict; org_id on EVERY query; parameterized $1..; uses the
 * `query`/`pool` helpers from ../db; emails lowercased/trimmed, phones stripped to
 * digits. No new npm deps — fuzzy matching is an in-house normalized-token Jaccard
 * blended with Levenshtein ratio (see `fuzzyScore`).
 *
 * TODO(verify): column names below were written against the migration
 * prism_identity_edges DDL: (id, org_id, person_a, person_b, evidence jsonb,
 * confidence numeric, confirmed bool, created_at). Re-verify the live schema before
 * relying on `confirmed` / `evidence` shapes.
 */
import { query, pool } from '../db';
import type { PoolClient } from 'pg';

// ─────────────────────────────────────────────────────────────────────────────
// Public contract
// ─────────────────────────────────────────────────────────────────────────────

export interface IdentityCandidate {
  email?: string | null;
  phone?: string | null;
  externalId?: string | null;
  name?: string | null;
  org?: string | null;     // sub-org / business unit hint for probabilistic disambiguation
  locale?: string | null;
  [extra: string]: unknown;
}

/** Basis on which two identities were (or could be) matched. */
export type MatchBasis = 'email' | 'phone' | 'external_id' | 'fuzzy_name' | 'none';

export interface MatchEvidence {
  basis: MatchBasis;
  matched_on?: string;              // the normalized value that matched (deterministic)
  score?: number;                   // probabilistic score (0..1) when basis = 'fuzzy_name'
  source_platforms?: string[];
  details?: Record<string, unknown>;
}

export interface ResolveResult {
  /** Stable connected-component id (min identity_key of the component). */
  xperiq_person_id: string;
  /** The normalized identity_key this candidate resolves to (component-local node id). */
  identity_key: string;
  matched: boolean;                 // true if it joined an EXISTING component (not a brand-new node)
  confidence: number;               // 0..1 (1.0 = deterministic)
  evidence: MatchEvidence;
  /** True for low-confidence probabilistic matches → propose, do NOT auto-merge. */
  needs_confirmation?: boolean;
  /** When needs_confirmation, the existing person we'd propose linking to. */
  proposed_link?: { person: string; score: number };
}

export interface IdentityEdge {
  id: string;
  org_id: string;
  person_a: string;
  person_b: string;
  evidence: MatchEvidence | Record<string, unknown>;
  confidence: number;
  confirmed: boolean;
  created_at: string;
}

export interface SurvivorshipProfile {
  xperiq_person_id: string;
  /** Source identity_keys folded into this cluster. */
  members: string[];
  /** Unified field values, each tagged with the winning source. */
  fields: Record<string, { value: unknown; source: string; precedence: number }>;
}

// Probabilistic auto-link is gated: at/above this we may write a confirmed edge on
// deterministic-equivalent strength; below the floor we ignore; in-between → propose.
const FUZZY_AUTO_CONFIRM = 0.92; // treat as effectively deterministic
const FUZZY_PROPOSE_FLOOR = 0.55; // below this we don't even propose a link

// ─────────────────────────────────────────────────────────────────────────────
// Normalization helpers (emails lowercase/trim; phones digits-only)
// ─────────────────────────────────────────────────────────────────────────────

export function normalizeEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const trimmed = email.trim().toLowerCase();
  return trimmed.length ? trimmed : null;
}

export function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D+/g, '');
  return digits.length ? digits : null;
}

function normalizeExternalId(id: string | null | undefined): string | null {
  if (!id) return null;
  const trimmed = id.trim();
  return trimmed.length ? trimmed : null;
}

/** Lowercase, strip punctuation, collapse whitespace → token set for fuzzy match. */
function nameTokens(name: string | null | undefined): string[] {
  if (!name) return [];
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Stable identity_key for a candidate: the strongest available identifier wins,
 * email → phone → external_id, namespaced so they never collide. Falls back to a
 * normalized-name key (weakest). This is the graph node id (person_a / person_b).
 */
export function identityKey(candidate: IdentityCandidate): string {
  const email = normalizeEmail(candidate.email);
  if (email) return `email:${email}`;
  const phone = normalizePhone(candidate.phone);
  if (phone) return `phone:${phone}`;
  const ext = normalizeExternalId(candidate.externalId);
  if (ext) return `extid:${ext}`;
  const tokens = nameTokens(candidate.name);
  if (tokens.length) return `name:${tokens.sort().join('_')}`;
  return 'anon:unknown';
}

// ─────────────────────────────────────────────────────────────────────────────
// In-house fuzzy matching (NO external library)
//   blend = max(token-set Jaccard, Levenshtein ratio of the joined string)
// ─────────────────────────────────────────────────────────────────────────────

function jaccard(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let inter = 0;
  for (const t of setA) if (setB.has(t)) inter++;
  const union = setA.size + setB.size - inter;
  return union === 0 ? 0 : inter / union;
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let prev: number[] = Array.from({ length: b.length + 1 }, (_, i) => i);
  let curr: number[] = new Array<number>(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
}

function levenshteinRatio(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

/**
 * Probabilistic similarity 0..1 over name + org + locale. Name dominates; matching
 * org boosts, a locale MISMATCH dampens (different region → likely different person).
 */
export function fuzzyScore(a: IdentityCandidate, b: IdentityCandidate): number {
  const ta = nameTokens(a.name);
  const tb = nameTokens(b.name);
  if (ta.length === 0 || tb.length === 0) return 0;
  const nameSim = Math.max(
    jaccard(ta, tb),
    levenshteinRatio(ta.sort().join(' '), tb.sort().join(' ')),
  );

  let score = nameSim;
  const orgA = (a.org ?? '').trim().toLowerCase();
  const orgB = (b.org ?? '').trim().toLowerCase();
  if (orgA && orgB) score = orgA === orgB ? Math.min(1, score + 0.1) : score * 0.85;

  const locA = (a.locale ?? '').trim().toLowerCase();
  const locB = (b.locale ?? '').trim().toLowerCase();
  if (locA && locB && locA !== locB) score *= 0.9;

  return Math.max(0, Math.min(1, score));
}

// ─────────────────────────────────────────────────────────────────────────────
// resolveIdentity — deterministic blocking, then probabilistic
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolve a candidate to a stable xperiq_person_id within an org.
 *
 * 1. Deterministic blocking (exact, confidence 1.0): the candidate's strongest
 *    normalized identifier (email→phone→external_id) becomes its identity_key. If
 *    that key already participates in any edge, it is part of an existing component →
 *    matched, return the component id.
 * 2. Probabilistic residual: with no deterministic block hit, fuzzy-score the
 *    candidate (name+org+locale) against existing component-representative nodes.
 *    ≥ FUZZY_AUTO_CONFIRM → match; FUZZY_PROPOSE_FLOOR..auto → needs_confirmation
 *    (propose, never auto-merge); below floor → brand-new singleton component.
 *
 * No edges are written here — resolution is read-only. Confirmed deterministic links
 * are written by the engine via addEdge on the LOAD seam; probabilistic links only
 * after the proposal is confirmed.
 */
export async function resolveIdentity(
  orgId: string,
  candidate: IdentityCandidate,
): Promise<ResolveResult> {
  const key = identityKey(candidate);

  // (1) Deterministic blocking — does this exact key already live in the graph?
  const { rows: hit } = await query<{ person: string }>(
    `SELECT person_a AS person FROM prism_identity_edges
       WHERE org_id = $1 AND (person_a = $2 OR person_b = $2)
     LIMIT 1`,
    [orgId, key],
  );

  const basis: MatchBasis = key.startsWith('email:')
    ? 'email'
    : key.startsWith('phone:')
      ? 'phone'
      : key.startsWith('extid:')
        ? 'external_id'
        : 'none';

  if (hit.length > 0) {
    // The key is already a node in some component → resolve that component.
    const component = await componentMembers(orgId, key);
    return {
      xperiq_person_id: canonicalId(component),
      identity_key: key,
      matched: true,
      confidence: 1.0,
      evidence: { basis, matched_on: key.split(':').slice(1).join(':') },
    };
  }

  // The key is a singleton (no edges yet). For a strong deterministic key, it simply
  // IS its own component until an edge links it — matched=false (new node).
  if (basis !== 'none') {
    return {
      xperiq_person_id: key,
      identity_key: key,
      matched: false,
      confidence: 1.0,
      evidence: { basis, matched_on: key.split(':').slice(1).join(':') },
    };
  }

  // (2) Probabilistic residual — only reachable when we have no strong identifier
  // (name-only candidate). Compare against existing component-representative nodes.
  const best = await bestFuzzyMatch(orgId, candidate);
  if (best && best.score >= FUZZY_AUTO_CONFIRM) {
    const component = await componentMembers(orgId, best.person);
    return {
      xperiq_person_id: canonicalId(component.length ? component : [best.person]),
      identity_key: key,
      matched: true,
      confidence: best.score,
      evidence: { basis: 'fuzzy_name', score: best.score, details: { matched_person: best.person } },
    };
  }

  if (best && best.score >= FUZZY_PROPOSE_FLOOR) {
    // Low/medium confidence → PROPOSE, do not auto-merge.
    return {
      xperiq_person_id: key, // stays its own component until confirmed
      identity_key: key,
      matched: false,
      confidence: best.score,
      evidence: { basis: 'fuzzy_name', score: best.score, details: { matched_person: best.person } },
      needs_confirmation: true,
      proposed_link: { person: best.person, score: best.score },
    };
  }

  // No usable match → brand-new singleton identity.
  return {
    xperiq_person_id: key,
    identity_key: key,
    matched: false,
    confidence: best ? best.score : 0,
    evidence: { basis: 'none' },
  };
}

/**
 * Score the candidate against existing nodes in the org's graph. We scan the
 * distinct nodes (person_a/person_b) and reconstruct an IdentityCandidate from the
 * key namespace where possible (name keys carry tokens). Bounded scan.
 */
async function bestFuzzyMatch(
  orgId: string,
  candidate: IdentityCandidate,
): Promise<{ person: string; score: number } | null> {
  const { rows } = await query<{ person: string }>(
    `SELECT DISTINCT person FROM (
        SELECT person_a AS person FROM prism_identity_edges WHERE org_id = $1
        UNION
        SELECT person_b AS person FROM prism_identity_edges WHERE org_id = $1
     ) nodes
     WHERE person LIKE 'name:%'
     LIMIT 5000`,
    [orgId],
  );

  let best: { person: string; score: number } | null = null;
  for (const { person } of rows) {
    // Reconstruct a comparable candidate from the name-key tokens.
    const tokens = person.slice('name:'.length).split('_');
    const score = fuzzyScore(candidate, { name: tokens.join(' '), org: candidate.org, locale: candidate.locale });
    if (!best || score > best.score) best = { person, score };
  }
  return best;
}

// ─────────────────────────────────────────────────────────────────────────────
// Edge writes (the reversible graph)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Write (or upsert) a reversible identity edge. The pair is normalized a <= b so the
 * UNIQUE(org_id, person_a, person_b) constraint dedups regardless of arg order.
 * Deterministic edges (confidence >= FUZZY_AUTO_CONFIRM) are stored confirmed=true;
 * weaker edges are proposed (confirmed=false) until a user confirms.
 */
export async function addEdge(
  orgId: string,
  personA: string,
  personB: string,
  evidence: MatchEvidence | Record<string, unknown>,
  confidence: number,
): Promise<IdentityEdge> {
  if (personA === personB) {
    throw new Error('addEdge: cannot link an identity to itself');
  }
  const [a, b] = personA <= personB ? [personA, personB] : [personB, personA];
  const confirmed = confidence >= FUZZY_AUTO_CONFIRM;
  const { rows } = await query<IdentityEdge>(
    `INSERT INTO prism_identity_edges (org_id, person_a, person_b, evidence, confidence, confirmed)
       VALUES ($1, $2, $3, $4::jsonb, $5, $6)
     ON CONFLICT (org_id, person_a, person_b) DO UPDATE SET
       evidence   = EXCLUDED.evidence,
       confidence = EXCLUDED.confidence,
       confirmed  = EXCLUDED.confirmed
     RETURNING id, org_id, person_a, person_b, evidence, confidence, confirmed, created_at`,
    [orgId, a, b, JSON.stringify(evidence), confidence, confirmed],
  );
  return rows[0];
}

/** Hard-delete an edge by id (scoped to org). See `unmerge` for the recompute path. */
export async function removeEdge(orgId: string, edgeId: string): Promise<boolean> {
  const { rowCount } = await query(
    `DELETE FROM prism_identity_edges WHERE org_id = $1 AND id = $2`,
    [orgId, edgeId],
  );
  return (rowCount ?? 0) > 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Connected component — recursive CTE over the undirected edge graph
// ─────────────────────────────────────────────────────────────────────────────

/**
 * All identity_keys reachable from `personId` over the edge set (the connected
 * component). Implemented as a WITH RECURSIVE walk over person_a/person_b in BOTH
 * directions (edges are undirected). org_id scopes every step. A node with no edges
 * yields just itself.
 */
async function componentMembers(orgId: string, personId: string): Promise<string[]> {
  const { rows } = await query<{ node: string }>(
    `WITH RECURSIVE reach(node) AS (
        SELECT $2::text
      UNION
        SELECT CASE WHEN e.person_a = r.node THEN e.person_b ELSE e.person_a END
        FROM prism_identity_edges e
        JOIN reach r ON (e.person_a = r.node OR e.person_b = r.node)
        WHERE e.org_id = $1
     )
     SELECT DISTINCT node FROM reach`,
    [orgId, personId],
  );
  const members = rows.map((r) => r.node);
  return members.length ? members : [personId];
}

/** Canonical, stable id for a component = lexicographically-min member. */
function canonicalId(members: string[]): string {
  if (members.length === 0) return 'anon:unknown';
  return members.reduce((min, m) => (m < min ? m : min), members[0]);
}

/**
 * Public component resolver → the stable xperiq_person_id for a person.
 * (union-find could compute this incrementally as edges are added; we use the
 * recursive CTE so the answer is always correct against the live edge set, even
 * after a reversal splits a component.)
 */
export async function computeComponent(
  orgId: string,
  personId: string,
): Promise<{ xperiq_person_id: string; members: string[] }> {
  const members = await componentMembers(orgId, personId);
  return { xperiq_person_id: canonicalId(members), members };
}

// ─────────────────────────────────────────────────────────────────────────────
// unmerge — reversible: drop an edge and recompute affected components
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Reverse a link: delete one edge, then recompute the components of its (former)
 * endpoints. Dropping an edge can SPLIT one component into two; we return the
 * resulting components so callers can re-stamp lineage rather than mutate stored
 * ids. Used for corrections and as a GDPR primitive. Runs in a txn so the delete
 * and the recompute observe a consistent edge set.
 */
export async function unmerge(
  orgId: string,
  edgeId: string,
): Promise<{ removed: boolean; components: { xperiq_person_id: string; members: string[] }[] }> {
  const client: PoolClient = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: edgeRows } = await client.query<{ person_a: string; person_b: string }>(
      `DELETE FROM prism_identity_edges WHERE org_id = $1 AND id = $2
       RETURNING person_a, person_b`,
      [orgId, edgeId],
    );
    if (edgeRows.length === 0) {
      await client.query('ROLLBACK');
      return { removed: false, components: [] };
    }
    const { person_a, person_b } = edgeRows[0];

    // Recompute the component from each former endpoint over the post-delete graph.
    const components: { xperiq_person_id: string; members: string[] }[] = [];
    const seen = new Set<string>();
    for (const endpoint of [person_a, person_b]) {
      const { rows } = await client.query<{ node: string }>(
        `WITH RECURSIVE reach(node) AS (
            SELECT $2::text
          UNION
            SELECT CASE WHEN e.person_a = r.node THEN e.person_b ELSE e.person_a END
            FROM prism_identity_edges e
            JOIN reach r ON (e.person_a = r.node OR e.person_b = r.node)
            WHERE e.org_id = $1
         )
         SELECT DISTINCT node FROM reach`,
        [orgId, endpoint],
      );
      const members = rows.map((r) => r.node);
      const list = members.length ? members : [endpoint];
      const id = canonicalId(list);
      if (!seen.has(id)) {
        seen.add(id);
        components.push({ xperiq_person_id: id, members: list });
      }
    }
    await client.query('COMMIT');
    return { removed: true, components };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// survivorshipProfile — unified profile with source-of-record precedence
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Source-of-record precedence (higher wins) for survivorship. A verified/owned
 * first-party identifier outranks a derived/third-party one. The platform that
 * supplied a value is read from the edge evidence (source_platforms).
 */
const SOURCE_PRECEDENCE: Record<string, number> = {
  email: 100,      // verified contact identifiers are strongest
  phone: 90,
  external_id: 80, // a customer-supplied stable id
  name: 10,        // weakest — fuzzy
};

function keyKind(identity_key: string): string {
  const idx = identity_key.indexOf(':');
  return idx === -1 ? 'name' : identity_key.slice(0, idx);
}

/**
 * Build the unified profile for a cluster: gather every member identity_key, then
 * for each field (email/phone/external_id/name) pick the value from the member whose
 * key-kind has the highest precedence. The result is a derived VIEW over the cluster
 * — no source identity is destroyed, so it remains reversible / GDPR-safe.
 */
export async function survivorshipProfile(
  orgId: string,
  xperiqPersonId: string,
): Promise<SurvivorshipProfile> {
  const members = await componentMembers(orgId, xperiqPersonId);

  const fields: SurvivorshipProfile['fields'] = {};
  const consider = (field: string, value: unknown, source: string) => {
    const precedence = SOURCE_PRECEDENCE[source] ?? 0;
    const existing = fields[field];
    if (!existing || precedence > existing.precedence) {
      fields[field] = { value, source, precedence };
    }
  };

  for (const member of members) {
    const kind = keyKind(member);
    const value = member.slice(member.indexOf(':') + 1);
    switch (kind) {
      case 'email':
        consider('email', value, 'email');
        break;
      case 'phone':
        consider('phone', value, 'phone');
        break;
      case 'extid':
        consider('external_id', value, 'external_id');
        break;
      case 'name':
        consider('name', value.replace(/_/g, ' '), 'name');
        break;
      default:
        break;
    }
  }

  return { xperiq_person_id: canonicalId(members), members, fields };
}

// ─────────────────────────────────────────────────────────────────────────────
// erasePersonIdentity — GDPR Art.17: remove ONE source identity, keep the cluster
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Erase a single source identity (`sourcePersonId`) from the graph WITHOUT nuking the
 * connected component (GDPR Art.17 — right to erasure of one source's data while the
 * rest of the cluster, lawfully held from other sources, persists). We drop every
 * edge touching that node, audit the removed edges (returned for the caller to
 * persist to the audit log), then report the components that survive.
 *
 * Because edges are reversible and xperiq_person_id is derived, removing a node may
 * split the residual graph; callers re-stamp lineage from the returned components.
 */
export async function erasePersonIdentity(
  orgId: string,
  sourcePersonId: string,
): Promise<{
  erased: boolean;
  removed_edges: { id: string; person_a: string; person_b: string }[];
  surviving_components: { xperiq_person_id: string; members: string[] }[];
}> {
  const client: PoolClient = await pool.connect();
  try {
    await client.query('BEGIN');

    // Capture the neighbors before deletion so we can recompute their components after.
    const { rows: neighborRows } = await client.query<{ neighbor: string }>(
      `SELECT DISTINCT CASE WHEN person_a = $2 THEN person_b ELSE person_a END AS neighbor
         FROM prism_identity_edges
        WHERE org_id = $1 AND (person_a = $2 OR person_b = $2)`,
      [orgId, sourcePersonId],
    );

    // Drop every edge incident on the erased node (audited via RETURNING).
    const { rows: removed } = await client.query<{ id: string; person_a: string; person_b: string }>(
      `DELETE FROM prism_identity_edges
        WHERE org_id = $1 AND (person_a = $2 OR person_b = $2)
       RETURNING id, person_a, person_b`,
      [orgId, sourcePersonId],
    );

    // Recompute the components of the (former) neighbors over the post-erasure graph.
    const surviving: { xperiq_person_id: string; members: string[] }[] = [];
    const seen = new Set<string>();
    for (const { neighbor } of neighborRows) {
      const { rows } = await client.query<{ node: string }>(
        `WITH RECURSIVE reach(node) AS (
            SELECT $2::text
          UNION
            SELECT CASE WHEN e.person_a = r.node THEN e.person_b ELSE e.person_a END
            FROM prism_identity_edges e
            JOIN reach r ON (e.person_a = r.node OR e.person_b = r.node)
            WHERE e.org_id = $1
         )
         SELECT DISTINCT node FROM reach`,
        [orgId, neighbor],
      );
      const members = rows.map((r) => r.node);
      const list = members.length ? members : [neighbor];
      const id = canonicalId(list);
      if (!seen.has(id)) {
        seen.add(id);
        surviving.push({ xperiq_person_id: id, members: list });
      }
    }

    await client.query('COMMIT');
    return { erased: removed.length > 0, removed_edges: removed, surviving_components: surviving };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
