FROM pgvector/pgvector:pg16
COPY supabase/migrations/20240101000000_initial.sql            /docker-entrypoint-initdb.d/01-initial.sql
COPY supabase/migrations/20240514000000_agents.sql             /docker-entrypoint-initdb.d/02-agents.sql
COPY supabase/migrations/20240515000000_agents_compliance.sql  /docker-entrypoint-initdb.d/03-agents-compliance.sql
COPY supabase/migrations/20240516000000_insights.sql           /docker-entrypoint-initdb.d/04-insights.sql
COPY supabase/migrations/20240517000000_surveys_v2.sql         /docker-entrypoint-initdb.d/05-surveys-v2.sql
COPY supabase/migrations/20240518000000_insights_v2.sql        /docker-entrypoint-initdb.d/06-insights-v2.sql
COPY supabase/migrations/20240519000000_response_enrichment.sql /docker-entrypoint-initdb.d/07-response-enrichment.sql
COPY supabase/migrations/20240520000000_base_runtime_tables.sql /docker-entrypoint-initdb.d/08-base-runtime-tables.sql
COPY supabase/migrations/20240520000000_topic_centroids.sql    /docker-entrypoint-initdb.d/09-topic-centroids.sql
COPY supabase/migrations/20240521000000_crystal_checkpoints.sql /docker-entrypoint-initdb.d/10-crystal-checkpoints.sql
COPY supabase/migrations/20240522000000_insight_settings.sql   /docker-entrypoint-initdb.d/11-insight-settings.sql
COPY supabase/migrations/20240523000000_insight_checkpoints_v2.sql /docker-entrypoint-initdb.d/12-insight-checkpoints-v2.sql
COPY supabase/migrations/20240524000000_insight_reports.sql    /docker-entrypoint-initdb.d/13-insight-reports.sql
COPY supabase/migrations/20240525000000_insights_v2_extensions.sql /docker-entrypoint-initdb.d/14-insights-v2-extensions.sql
COPY supabase/migrations/20240526000000_custom_reports.sql     /docker-entrypoint-initdb.d/15-custom-reports.sql
COPY supabase/migrations/20240527000000_insight_crystal_indexes.sql /docker-entrypoint-initdb.d/16-insight-crystal-indexes.sql
