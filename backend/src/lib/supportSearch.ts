/**
 * Support docs search helper.
 *
 * Primary path: pgvector cosine similarity on the 1536-dim embeddings column.
 * Fallback (when no embedding array is supplied): Postgres full-text search via
 * to_tsvector / plainto_tsquery so the route still works before CrystalOS has
 * generated embeddings for a doc.
 */
import { query } from './db';

/**
 * Search live support docs by semantic similarity (embedding) or full-text
 * (fallback when embedding is null / not provided).
 *
 * @param queryText  - The user's search string (used for FTS fallback)
 * @param embedding  - 1536-dim embedding vector, or null for FTS fallback
 * @param limit      - Max rows (default 10, caller-enforced max 20)
 * @param category   - Optional category filter
 */
async function searchSupportDocs(
  queryText: string,
  embedding: number[] | null,
  limit = 10,
  category?: string,
): Promise<Array<Record<string, unknown>>> {
  const safeLimit = Math.min(20, Math.max(1, limit));

  if (embedding && embedding.length > 0) {
    // ── Vector similarity search ───────────────────────────────────────────
    const vectorLiteral = `[${embedding.join(',')}]`;
    const params = [vectorLiteral, safeLimit];
    let sql = `
      SELECT id, key, title, content, category,
             1 - (embedding <=> $1::vector) AS similarity
        FROM support_docs
       WHERE deleted_at IS NULL
         AND pipeline_status = 'live'
         AND embedding IS NOT NULL
    `;
    if (category) {
      params.push(category);
      sql += ` AND category = $${params.length}`;
    }
    sql += ` ORDER BY embedding <=> $1::vector LIMIT $2`;

    const { rows } = await query(sql, params);
    return rows;
  }

  // ── Full-text search fallback ──────────────────────────────────────────────
  const params = [queryText, safeLimit];
  let sql = `
    SELECT id, key, title, content, category,
           ts_rank(
             to_tsvector('english', title || ' ' || content),
             plainto_tsquery('english', $1)
           ) AS similarity
      FROM support_docs
     WHERE deleted_at IS NULL
       AND pipeline_status = 'live'
       AND to_tsvector('english', title || ' ' || content)
           @@ plainto_tsquery('english', $1)
  `;
  if (category) {
    params.push(category);
    sql += ` AND category = $${params.length}`;
  }
  sql += ` ORDER BY similarity DESC LIMIT $2`;

  const { rows } = await query(sql, params);
  return rows;
}

export { searchSupportDocs };
