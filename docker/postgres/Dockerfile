FROM pgvector/pgvector:pg16
COPY supabase/migrations/20240101000000_initial.sql       /docker-entrypoint-initdb.d/01-initial.sql
COPY supabase/migrations/20240514000000_agents.sql        /docker-entrypoint-initdb.d/02-agents.sql
COPY supabase/migrations/20240515000000_agents_compliance.sql /docker-entrypoint-initdb.d/03-agents-compliance.sql
