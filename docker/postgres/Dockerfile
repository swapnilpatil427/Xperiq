FROM pgvector/pgvector:pg16
COPY supabase/migrations/20240101000000_initial.sql            /docker-entrypoint-initdb.d/01-initial.sql
COPY supabase/migrations/20240514000000_agents.sql             /docker-entrypoint-initdb.d/02-agents.sql
COPY supabase/migrations/20240515000000_agents_compliance.sql  /docker-entrypoint-initdb.d/03-agents-compliance.sql
COPY supabase/migrations/20240516000000_insights.sql           /docker-entrypoint-initdb.d/04-insights.sql
COPY supabase/migrations/20240517000000_surveys_v2.sql         /docker-entrypoint-initdb.d/05-surveys-v2.sql
COPY supabase/migrations/20240518000000_insights_v2.sql        /docker-entrypoint-initdb.d/06-insights-v2.sql
COPY supabase/migrations/20240519000000_response_enrichment.sql /docker-entrypoint-initdb.d/07-response-enrichment.sql
