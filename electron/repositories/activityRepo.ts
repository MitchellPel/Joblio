import { getDatabase } from '../db/connection';
import { createDbHelpers } from '../db/helpers';

export type ActivityKind = 'stage' | 'note' | 'mention' | 'created' | 'archived';

export interface ActivityItem {
  id: string;
  kind: ActivityKind;
  job_id: number;
  job_no: string;
  job_name: string;
  actor_name: string;
  summary: string;
  created_at: string;
}

/**
 * Recent activity across the workshop — union of stage moves, notes,
 * mentions, job creates, and archives. No extra write path required.
 */
export function listRecentActivity(limit = 80): ActivityItem[] {
  const db = getDatabase();
  const h = createDbHelpers(db);

  const stages = h.all(
    `SELECT
       'stage-' || sh.id AS id,
       'stage' AS kind,
       sh.job_id AS job_id,
       j.job_no AS job_no,
       j.job_name AS job_name,
       IFNULL(u.full_name, 'Someone') AS actor_name,
       CASE
         WHEN sh.from_stage IS NULL THEN 'moved to ' || sh.to_stage
         ELSE 'moved from ' || sh.from_stage || ' → ' || sh.to_stage
       END AS summary,
       sh.changed_at AS created_at
     FROM stage_history sh
     JOIN jobs j ON j.id = sh.job_id
     LEFT JOIN users u ON u.id = sh.changed_by
     ORDER BY sh.changed_at DESC
     LIMIT ?`,
    [limit]
  );

  const notes = h.all(
    `SELECT
       'note-' || n.id AS id,
       'note' AS kind,
       n.job_id AS job_id,
       j.job_no AS job_no,
       j.job_name AS job_name,
       IFNULL(u.full_name, 'Someone') AS actor_name,
       CASE
         WHEN length(n.body) > 80 THEN substr(n.body, 1, 77) || '…'
         ELSE n.body
       END AS summary,
       n.created_at AS created_at
     FROM job_notes n
     JOIN jobs j ON j.id = n.job_id
     LEFT JOIN users u ON u.id = n.author_id
     ORDER BY n.created_at DESC
     LIMIT ?`,
    [limit]
  );

  const mentions = h.all(
    `SELECT
       'mention-' || m.id AS id,
       'mention' AS kind,
       m.job_id AS job_id,
       j.job_no AS job_no,
       j.job_name AS job_name,
       IFNULL(author.full_name, 'Someone') AS actor_name,
       'mentioned ' || IFNULL(mentioned.full_name, 'a teammate') AS summary,
       m.created_at AS created_at
     FROM note_mentions m
     JOIN jobs j ON j.id = m.job_id
     LEFT JOIN users author ON author.id = m.created_by
     LEFT JOIN users mentioned ON mentioned.id = m.mentioned_user_id
     ORDER BY m.created_at DESC
     LIMIT ?`,
    [limit]
  );

  const created = h.all(
    `SELECT
       'created-' || j.id AS id,
       'created' AS kind,
       j.id AS job_id,
       j.job_no AS job_no,
       j.job_name AS job_name,
       IFNULL(u.full_name, 'Someone') AS actor_name,
       'created this job' AS summary,
       j.created_at AS created_at
     FROM jobs j
     LEFT JOIN users u ON u.id = j.created_by
     ORDER BY j.created_at DESC
     LIMIT ?`,
    [Math.min(limit, 40)]
  );

  const archived = h.all(
    `SELECT
       'archived-' || j.id AS id,
       'archived' AS kind,
       j.id AS job_id,
       j.job_no AS job_no,
       j.job_name AS job_name,
       IFNULL(u.full_name, 'Someone') AS actor_name,
       'archived this job' AS summary,
       j.archived_at AS created_at
     FROM jobs j
     LEFT JOIN users u ON u.id = j.created_by
     WHERE j.archived_at IS NOT NULL
     ORDER BY j.archived_at DESC
     LIMIT ?`,
    [Math.min(limit, 40)]
  );

  const all = [...stages, ...notes, ...mentions, ...created, ...archived] as ActivityItem[];
  all.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  return all.slice(0, limit);
}
