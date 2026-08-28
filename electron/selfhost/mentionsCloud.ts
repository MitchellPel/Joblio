import { sbFetch, sbJson } from './rest';
import { ensureUserCache, findUserByIdCloudCached } from './usersCloud';
import type { MentionRow } from '../repositories/mentionsRepo';

function asBoolSeen(v: unknown): number {
  return v === true || v === 1 || v === 'true' ? 1 : 0;
}

async function enrichMentions(rows: any[]): Promise<MentionRow[]> {
  if (!rows.length) return [];
  await ensureUserCache();

  const jobIds = [...new Set(rows.map((r) => Number(r.job_id)))];
  const noteIds = [...new Set(rows.map((r) => Number(r.note_id)))];

  const [jobs, notes] = await Promise.all([
    jobIds.length
      ? sbJson<any[]>('jobs', {
          query: {
            select: 'id,job_no,job_name',
            id: `in.(${jobIds.join(',')})`,
          },
        })
      : Promise.resolve([] as any[]),
    noteIds.length
      ? sbJson<any[]>('job_notes', {
          query: {
            select: 'id,body',
            id: `in.(${noteIds.join(',')})`,
          },
        })
      : Promise.resolve([] as any[]),
  ]);

  const jobMap = new Map(jobs.map((j) => [Number(j.id), j]));
  const noteMap = new Map(notes.map((n) => [Number(n.id), n]));

  return rows.map((m) => {
    const job = jobMap.get(Number(m.job_id));
    const note = noteMap.get(Number(m.note_id));
    return {
      id: Number(m.id),
      note_id: Number(m.note_id),
      job_id: Number(m.job_id),
      mentioned_user_id: Number(m.mentioned_user_id),
      created_by: Number(m.created_by),
      created_at: m.created_at,
      seen: asBoolSeen(m.seen),
      job_no: job?.job_no ?? '',
      job_name: job?.job_name ?? '',
      author_name: findUserByIdCloudCached(Number(m.created_by))?.full_name || 'Someone',
      note_body: note?.body ?? '',
    };
  });
}

/** Store mentions for a note. Self-mentions are ignored. */
export async function addMentionsCloud(
  noteId: number,
  jobId: number,
  mentionedUserIds: number[],
  createdBy: number
): Promise<void> {
  const ids = [...new Set(mentionedUserIds)].filter((id) => id !== createdBy);
  if (ids.length === 0) return;

  const payload = ids.map((userId) => ({
    note_id: noteId,
    job_id: jobId,
    mentioned_user_id: userId,
    created_by: createdBy,
    seen: false,
  }));

  const res = await sbFetch('note_mentions', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`add mentions ${res.status}: ${text}`);
  }
}

export async function listUnseenMentionsCloud(userId: number): Promise<MentionRow[]> {
  const rows = await sbJson<any[]>('note_mentions', {
    query: {
      select: '*',
      mentioned_user_id: `eq.${userId}`,
      seen: 'eq.false',
      order: 'created_at.desc',
    },
  });
  return enrichMentions(rows);
}

export async function listUnseenMentionJobIdsCloud(userId: number): Promise<number[]> {
  const rows = await sbJson<any[]>('note_mentions', {
    query: {
      select: 'job_id',
      mentioned_user_id: `eq.${userId}`,
      seen: 'eq.false',
    },
  });
  return [...new Set(rows.map((r) => Number(r.job_id)))];
}

export async function listUnseenMentionsForJobCloud(
  userId: number,
  jobId: number
): Promise<MentionRow[]> {
  const rows = await sbJson<any[]>('note_mentions', {
    query: {
      select: '*',
      mentioned_user_id: `eq.${userId}`,
      job_id: `eq.${jobId}`,
      seen: 'eq.false',
      order: 'created_at.desc',
    },
  });
  return enrichMentions(rows);
}

export async function markMentionsSeenCloud(userId: number, jobId: number): Promise<number> {
  const res = await sbFetch('note_mentions', {
    method: 'PATCH',
    query: {
      mentioned_user_id: `eq.${userId}`,
      job_id: `eq.${jobId}`,
      seen: 'eq.false',
    },
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ seen: true }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`mark mentions seen ${res.status}: ${text}`);
  const rows = text ? JSON.parse(text) : [];
  return Array.isArray(rows) ? rows.length : 0;
}
