// Normalizes Clerk session-token org claims across token versions.
//
// Clerk v1 tokens expose flat claims:   { org_id, org_role, org_slug }
// Clerk v2 tokens (the current default) nest them and drop the "org:" prefix:
//   { v: 2, o: { id, rol, slg, per, fpm } }   e.g. o.rol === "admin"
//
// Reading only the v1 claims silently breaks org resolution on v2 tokens (org_id
// comes back undefined → callers fall back to the user id → 403s on every write).

interface ClerkOrgV2 {
  id?: string;
  rol?: string;
  slg?: string;
}

interface ClerkClaims {
  org_id?: string;
  org_role?: string;
  org_slug?: string;
  o?: ClerkOrgV2;
  [k: string]: unknown;
}

export interface OrgClaims {
  orgId: string | null;
  /** Always normalized to the `org:<role>` form our RBAC tables use. */
  orgRole: string | null;
  orgSlug: string | null;
}

/** Extract org id / role / slug from a verified Clerk JWT payload (v1 or v2). */
export function getOrgClaims(payload: unknown): OrgClaims {
  const p = (payload || {}) as ClerkClaims;
  const v2 = p.o;

  const orgId = p.org_id || v2?.id || null;
  const orgSlug = p.org_slug || v2?.slg || null;

  // v1 already uses the "org:" prefix; v2 stores the bare role (e.g. "admin").
  let orgRole = p.org_role || null;
  if (!orgRole && v2?.rol) {
    orgRole = v2.rol.startsWith('org:') ? v2.rol : `org:${v2.rol}`;
  }

  return { orgId, orgRole, orgSlug };
}
