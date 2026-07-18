/*
 * Central activity logger. Every API route calls this after a write, which
 * powers: the dashboard "Recent activity" feed, per-order and per-customer
 * timelines, and an audit trail of who changed what.
 * Fire-and-forget: a logging failure must never break the actual operation.
 */
export async function logActivity(sql, user, action, entity, entityId, summary, meta = {}) {
  try {
    await sql`INSERT INTO activity (user_id, user_name, action, entity, entity_id, summary, meta)
      VALUES (${user?.id || null}, ${user?.name || "System"}, ${action}, ${entity},
              ${entityId || null}, ${String(summary || "").slice(0, 300)}, ${JSON.stringify(meta)})`;
  } catch (err) {
    console.error("activity log error", err);
  }
}

export async function entityActivity(sql, entity, entityId, limit = 30) {
  return sql`SELECT * FROM activity
    WHERE entity = ${entity} AND entity_id = ${entityId}
    ORDER BY created_at DESC LIMIT ${limit}`;
}
