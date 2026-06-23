-- Branching (graph) workflow support: resume a paused approval at a specific node
-- (graph mode) rather than an array index (linear mode). Nullable; linear workflows
-- keep using workflow_executions.resume_index.
ALTER TABLE workflow_executions ADD COLUMN IF NOT EXISTS resume_node_id TEXT;
