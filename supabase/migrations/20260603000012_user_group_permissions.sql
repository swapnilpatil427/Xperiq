-- Enterprise User Directory — Group-level resource permissions
-- Referenced by the permission engine (step 5: group-level allow/deny).

CREATE TABLE IF NOT EXISTS user_group_resource_permissions (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id               TEXT        NOT NULL,
  group_id             UUID        NOT NULL REFERENCES user_groups(id) ON DELETE CASCADE,
  resource_type        TEXT        NOT NULL,
  resource_id          TEXT        NOT NULL,
  action               TEXT        NOT NULL,
  effect               TEXT        NOT NULL DEFAULT 'allow' CHECK (effect IN ('allow','deny')),
  granted_by           TEXT,
  granted_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_group_resource_permission
    UNIQUE (org_id, group_id, resource_type, resource_id, action)
);
CREATE INDEX IF NOT EXISTS idx_grp_perm_group    ON user_group_resource_permissions(group_id);
CREATE INDEX IF NOT EXISTS idx_grp_perm_resource ON user_group_resource_permissions(resource_type, resource_id);
