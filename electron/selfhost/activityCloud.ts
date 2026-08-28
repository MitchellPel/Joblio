import { sbJson } from './rest';
import { ensureUserCache, findUserByIdCloudCached } from './usersCloud';
import type { ActivityItem } from '../repositories/activityRepo';

function truncate(body: string, max = 80): string {
  const plain = String(body || '').replace(/\s+/g, ' ').trim();
  if (plain.length <= max) return plain;
  return `${plain.slice(0, max - 1).trimEnd()}…`;
}

/**
 * Recent activity across the workshop — same sources as SQLite activityRepo.
 */
export async function listRecentActivityCloud(limit = 80): Promise<ActivityItem[]> {
  await ensureUserCache();

  const [stages, notes, mentions, created, archived] = await Promise.all([
    sbJson<any[]>('stage_history', {
      query: {
        select: 'id,job_id,from_stage,to_stage,changed_by,changed_at',
        order: 'changed_at.desc',
        limit: String(limit),
      },
    }),
    sbJson<any[]>('job_notes', {
      query: {
        select: 'id,job_id,author_id,body,created_at',
        order: 'created_at.desc',
        limit: String(limit),
      },
    }),
    sbJson<any[]>('note_mentions', {
      query: {
        select: 'id,job_id,mentioned_user_id,created_by,created_at',
        order: 'created_at.desc',
        limit: String(limit),
      },
    }),
    sbJson<any[]>('jobs', {
      query: {
        select: 'id,job_no,job_name,created_by,created_at',
        order: 'created_at.desc',
        limit: String(Math.min(limit, 40)),
      },
    }),
    sbJson<any[]>('jobs', {
      query: {
        select: 'id,job_no,job_name,created_by,archived_at',
        archived_at: 'not.is.null',
        order: 'archived_at.desc',
        limit: String(Math.min(limit, 40)),
      },
    }),
  ]);

  const jobIds = new Set<number>();
  for (const r of stages) jobIds.add(Number(r.job_id));
  for (const r of notes) jobIds.add(Number(r.job_id));
  for (const r of mentions) jobIds.add(Number(r.job_id));

  const jobs =
    jobIds.size > 0
      ? await sbJson<any[]>('jobs', {
          query: {
            select: 'id,job_no,job_name',
            id: `in.(${[...jobIds].join(',')})`,
          },
        })
      : [];
  const jobMap = new Map(jobs.map((j) => [Number(j.id), j]));

  const name = (id: number | null | undefined) =>
    id != null ? findUserByIdCloudCached(Number(id))?.full_name || 'Someone' : 'Someone';

  const items: ActivityItem[] = [];

  for (const sh of stages) {
    const job = jobMap.get(Number(sh.job_id));
    if (!job) continue;
    items.push({
      id: `stage-${sh.id}`,
      kind: 'stage',
      job_id: Number(sh.job_id),
      job_no: job.job_no,
      job_name: job.job_name || '',
      actor_name: name(sh.changed_by),
      summary:
        sh.from_stage == null
          ? `moved to ${sh.to_stage}`
          : `moved from ${sh.from_stage} → ${sh.to_stage}`,
      created_at: sh.changed_at,
    });
  }

  for (const n of notes) {
    const job = jobMap.get(Number(n.job_id));
    if (!job) continue;
    items.push({
      id: `note-${n.id}`,
      kind: 'note',
      job_id: Number(n.job_id),
      job_no: job.job_no,
      job_name: job.job_name || '',
      actor_name: name(n.author_id),
      summary: truncate(n.body),
      created_at: n.created_at,
    });
  }

  for (const m of mentions) {
    const job = jobMap.get(Number(m.job_id));
    if (!job) continue;
    items.push({
      id: `mention-${m.id}`,
      kind: 'mention',
      job_id: Number(m.job_id),
      job_no: job.job_no,
      job_name: job.job_name || '',
      actor_name: name(m.created_by),
      summary: `mentioned ${name(m.mentioned_user_id)}`,
      created_at: m.created_at,
    });
  }

  for (const j of created) {
    items.push({
      id: `created-${j.id}`,
      kind: 'created',
      job_id: Number(j.id),
      job_no: j.job_no,
      job_name: j.job_name || '',
      actor_name: name(j.created_by),
      summary: 'created this job',
      created_at: j.created_at,
    });
  }

  for (const j of archived) {
    if (!j.archived_at) continue;
    items.push({
      id: `archived-${j.id}`,
      kind: 'archived',
      job_id: Number(j.id),
      job_no: j.job_no,
      job_name: j.job_name || '',
      actor_name: name(j.created_by),
      summary: 'archived this job',
      created_at: j.archived_at,
    });
  }

  items.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  return items.slice(0, limit);
}
