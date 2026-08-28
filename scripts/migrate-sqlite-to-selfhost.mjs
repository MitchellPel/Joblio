/**
 * READ-ONLY migrate: copy jobs.db → office Docker Postgres.
 * Does NOT modify the share DB or switch the live Joblio app.
 *
 * Usage: npm run migrate:selfhost
 *        node scripts/migrate-sqlite-to-selfhost.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import initSqlJs from 'sql.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const SHARE_DB = '\\\\server\\Gary\\Job Tracker\\jobs.db';
const LOCAL_COPY = path.join(ROOT, '.migrate-tmp', 'jobs-readonly-copy.db');

function loadEnv() {
  const candidates = [
    path.join(ROOT, '.env.selfhost'),
    path.join(ROOT, '.env.supabase'),
  ];
  let env = {};
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    const text = fs.readFileSync(file, 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (m) env[m[1]] = m[2];
    }
    break;
  }
  // Prefer office LAN for fast migrate (not ngrok)
  env.JOBLIO_API_URL = (env.JOBLIO_LAN_API_URL || env.JOBLIO_API_URL || env.SUPABASE_URL || 'http://192.168.1.107:8080').replace(/\/$/, '');
  // If URL is still an ngrok host but LAN is up, caller can override � default LAN for migrate:
  if (!env.JOBLIO_LAN_API_URL && !process.env.JOBLIO_MIGRATE_USE_TUNNEL) {
    env.JOBLIO_API_URL = 'http://192.168.1.107:8080';
  }
  const keyFile = path.join('\\\\server\\Gary\\Job Tracker', 'joblio-api-key.txt');
  let shareKey = '';
  try {
    if (fs.existsSync(keyFile)) shareKey = fs.readFileSync(keyFile, 'utf8').trim();
  } catch {}
  env.JOBLIO_API_KEY = env.JOBLIO_API_KEY || env.SUPABASE_SECRET_KEY || shareKey || '';
  if (!env.JOBLIO_API_URL) {
    throw new Error('Missing JOBLIO_API_URL / LAN URL');
  }
  if (!env.JOBLIO_API_KEY) {
    throw new Error('Missing JOBLIO_API_KEY (or joblio-api-key.txt on the share)');
  }
  return env;
}

function bool(v) {
  return v === 1 || v === true || v === '1';
}

function nullIfEmpty(v) {
  if (v === undefined || v === null || v === '') return null;
  return v;
}

async function apiInsert(env, table, rows, { upsert = false } = {}) {
  if (!rows.length) {
    console.log(`  ${table}: 0 rows (skip)`);
    return;
  }
  const chunkSize = 200;
  let done = 0;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const url = `${env.JOBLIO_API_URL}/rest/v1/${table}`;
    const headers = {
      apikey: env.JOBLIO_API_KEY,
      'X-Joblio-Key': env.JOBLIO_API_KEY,
      'Content-Type': 'application/json',
      Prefer: upsert
        ? 'resolution=merge-duplicates,return=minimal'
        : 'return=minimal',
      'User-Agent': 'JoblioMigrate/1.0',
    };
    if (upsert) {
      // on_conflict via query — primary key
      // PostgREST: Prefer + ?on_conflict=id
    }
    const endpoint = upsert ? `${url}?on_conflict=id` : url;
    const res = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(chunk),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`${table} insert failed (${res.status}): ${body}`);
    }
    done += chunk.length;
  }
  console.log(`  ${table}: ${done} rows`);
}

function all(db, sql) {
  const stmt = db.prepare(sql);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

async function main() {
  console.log('Joblio → Docker Postgres migrate (read-only from share)\n');
  const env = loadEnv();

  fs.mkdirSync(path.dirname(LOCAL_COPY), { recursive: true });
  console.log('Copying jobs.db locally (share stays untouched)...');
  fs.copyFileSync(SHARE_DB, LOCAL_COPY);
  const buf = fs.readFileSync(LOCAL_COPY);

  const SQL = await initSqlJs();
  const db = new SQL.Database(buf);

  const users = all(db, 'SELECT * FROM users ORDER BY id').map((r) => ({
    id: r.id,
    username: r.username,
    password_hash: r.password_hash,
    role: r.role,
    full_name: r.full_name || '',
    active: bool(r.active),
    can_archive: bool(r.can_archive),
    can_move_any: bool(r.can_move_any),
    can_edit_rigging: bool(r.can_edit_rigging),
    can_edit_vehicle_bookings: bool(r.can_edit_vehicle_bookings),
    created_at: r.created_at || new Date().toISOString(),
  }));

  const jobs = all(db, 'SELECT * FROM jobs ORDER BY id').map((r) => ({
    id: r.id,
    job_no: r.job_no,
    job_name: r.job_name || '',
    client: r.client || '',
    contact_name: nullIfEmpty(r.contact_name),
    contact_phone: nullIfEmpty(r.contact_phone),
    contact_email: nullIfEmpty(r.contact_email),
    stage: r.stage || 'new',
    assigned_to: r.assigned_to ?? null,
    due_date: nullIfEmpty(r.due_date),
    scope_notes: nullIfEmpty(r.scope_notes),
    pinned_brief: nullIfEmpty(r.pinned_brief),
    job_kind:
      r.job_kind === 'vehicle' || r.job_kind === 'sign' || r.job_kind === 'vinyl'
        ? r.job_kind
        : null,
    created_by: r.created_by,
    created_at: r.created_at || new Date().toISOString(),
    updated_at: r.updated_at || r.created_at || new Date().toISOString(),
    archived_at: nullIfEmpty(r.archived_at),
    version: r.version ?? 1,
  }));

  const stageHistory = all(db, 'SELECT * FROM stage_history ORDER BY id').map((r) => ({
    id: r.id,
    job_id: r.job_id,
    from_stage: nullIfEmpty(r.from_stage),
    to_stage: r.to_stage,
    changed_by: r.changed_by,
    changed_at: r.changed_at || new Date().toISOString(),
    note: nullIfEmpty(r.note),
  }));

  const notes = all(db, 'SELECT * FROM job_notes ORDER BY id').map((r) => ({
    id: r.id,
    job_id: r.job_id,
    author_id: r.author_id,
    body: r.body,
    created_at: r.created_at || new Date().toISOString(),
  }));

  const mentions = all(db, 'SELECT * FROM note_mentions ORDER BY id').map((r) => ({
    id: r.id,
    note_id: r.note_id,
    job_id: r.job_id,
    mentioned_user_id: r.mentioned_user_id,
    created_by: r.created_by,
    created_at: r.created_at || new Date().toISOString(),
    seen: bool(r.seen),
  }));

  const proofs = all(db, 'SELECT id, job_id, file_name, mime_type, size, uploaded_by, uploaded_name, created_at FROM job_proofs ORDER BY id').map(
    (r) => ({
      id: r.id,
      job_id: r.job_id,
      file_name: r.file_name,
      mime_type: r.mime_type,
      size: r.size || 0,
      // Files stay on share for now; path marked for later Storage upload
      storage_path: `legacy/${r.job_id}/${r.id}_${r.file_name}`,
      thumb_path: null,
      uploaded_by: r.uploaded_by,
      uploaded_name: nullIfEmpty(r.uploaded_name),
      created_at: r.created_at || new Date().toISOString(),
    })
  );

  const checklistTemplates = all(db, 'SELECT * FROM checklist_templates ORDER BY id').map((r) => ({
    id: r.id,
    name: r.name,
    created_by: r.created_by,
    created_at: r.created_at || new Date().toISOString(),
  }));

  const checklistTemplateItems = all(
    db,
    'SELECT * FROM checklist_template_items ORDER BY id'
  ).map((r) => ({
    id: r.id,
    template_id: r.template_id,
    body: r.body,
    sort_order: r.sort_order || 0,
  }));

  const jobChecklist = all(db, 'SELECT * FROM job_checklist_items ORDER BY id').map((r) => ({
    id: r.id,
    job_id: r.job_id,
    body: r.body,
    done: bool(r.done),
    sort_order: r.sort_order || 0,
    created_at: r.created_at || new Date().toISOString(),
  }));

  const riggingMonths = all(db, 'SELECT * FROM rigging_months').map((r) => ({
    year_month: r.year_month,
    status: r.status || 'active',
    archived_at: nullIfEmpty(r.archived_at),
  }));

  const riggingInstalls = all(db, 'SELECT * FROM rigging_installs ORDER BY id').map((r) => ({
    id: r.id,
    job_id: r.job_id,
    scheduled_date: r.scheduled_date,
    note: nullIfEmpty(r.note),
    created_by: r.created_by,
    created_at: r.created_at || new Date().toISOString(),
  }));

  const riggingAlerts = all(db, 'SELECT * FROM rigging_alerts_sent ORDER BY id').map((r) => ({
    id: r.id,
    user_id: r.user_id,
    install_id: r.install_id,
    alert_type: r.alert_type,
    alert_date: r.alert_date,
    sent_at: r.sent_at || new Date().toISOString(),
  }));

  const vehicles = all(db, 'SELECT * FROM vehicles ORDER BY id').map((r) => ({
    id: r.id,
    name: r.name,
    active: bool(r.active),
    sort_order: r.sort_order || 0,
    created_at: r.created_at || new Date().toISOString(),
  }));

  const vehicleMonths = all(db, 'SELECT * FROM vehicle_booking_months').map((r) => ({
    year_month: r.year_month,
    status: r.status || 'active',
    archived_at: nullIfEmpty(r.archived_at),
  }));

  const vehicleBookings = all(db, 'SELECT * FROM vehicle_bookings ORDER BY id').map((r) => ({
    id: r.id,
    job_id: r.job_id,
    scheduled_date: r.scheduled_date,
    note: nullIfEmpty(r.note),
    created_by: r.created_by,
    created_at: r.created_at || new Date().toISOString(),
  }));

  db.close();

  const jobIds = new Set(jobs.map((j) => j.id));
  const userIds = new Set(users.map((u) => u.id));
  const noteIds = new Set(notes.map((n) => n.id));
  const installIds = new Set(riggingInstalls.map((r) => r.id));
  const templateIds = new Set(checklistTemplates.map((t) => t.id));

  const stageHistoryOk = stageHistory.filter((r) => jobIds.has(r.job_id) && userIds.has(r.changed_by));
  const notesOk = notes.filter((r) => jobIds.has(r.job_id) && userIds.has(r.author_id));
  const noteIdsOk = new Set(notesOk.map((n) => n.id));
  const mentionsOk = mentions.filter(
    (r) =>
      noteIdsOk.has(r.note_id) &&
      jobIds.has(r.job_id) &&
      userIds.has(r.mentioned_user_id) &&
      userIds.has(r.created_by)
  );
  const proofsOk = proofs.filter((r) => jobIds.has(r.job_id) && userIds.has(r.uploaded_by));
  const checklistTemplatesOk = checklistTemplates.filter((r) => userIds.has(r.created_by));
  const checklistTemplateItemsOk = checklistTemplateItems.filter((r) =>
    templateIds.has(r.template_id)
  );
  const jobChecklistOk = jobChecklist.filter((r) => jobIds.has(r.job_id));
  const riggingInstallsOk = riggingInstalls.filter(
    (r) => jobIds.has(r.job_id) && userIds.has(r.created_by)
  );
  const installIdsOk = new Set(riggingInstallsOk.map((r) => r.id));
  const riggingAlertsOk = riggingAlerts.filter(
    (r) => userIds.has(r.user_id) && installIdsOk.has(r.install_id)
  );
  const vehicleBookingsOk = vehicleBookings.filter(
    (r) => jobIds.has(r.job_id) && userIds.has(r.created_by)
  );

  const orphanStage = stageHistory.length - stageHistoryOk.length;
  const orphanNotes = notes.length - notesOk.length;
  if (orphanStage || orphanNotes) {
    console.log(
      `\nSkipping orphaned rows (deleted jobs/users): stage_history ${orphanStage}, notes ${orphanNotes}, mentions ${mentions.length - mentionsOk.length}, proofs ${proofs.length - proofsOk.length}`
    );
  }

  console.log('\nSQLite snapshot counts:');
  console.log(`  users ${users.length}, jobs ${jobs.length}, notes ${notesOk.length}, proofs ${proofsOk.length}`);
  console.log(`  stage_history ${stageHistoryOk.length}, mentions ${mentionsOk.length}`);
  console.log(`  rigging_installs ${riggingInstallsOk.length}, vehicle_bookings ${vehicleBookingsOk.length}`);

  console.log('\nUploading to Docker Postgres (staff app unchanged)...');

  // Clear cloud tables first (empty project expected) — truncate in FK-safe order via delete
  const wipeOrder = [
    'rigging_alerts_sent',
    'note_mentions',
    'job_checklist_items',
    'checklist_template_items',
    'job_proofs',
    'job_notes',
    'stage_history',
    'vehicle_bookings',
    'rigging_installs',
    'vehicle_booking_months',
    'rigging_months',
    'vehicles',
    'checklist_templates',
    'jobs',
    'users',
  ];
  for (const table of wipeOrder) {
    const res = await fetch(`${env.JOBLIO_API_URL}/rest/v1/${table}?id=gte.0`, {
      method: 'DELETE',
      headers: {
        apikey: env.JOBLIO_API_KEY,
      'X-Joblio-Key': env.JOBLIO_API_KEY,
        'User-Agent': 'JoblioMigrate/1.0',
        Prefer: 'return=minimal',
      },
    });
    // year_month PK tables:
    if (!res.ok && (table === 'rigging_months' || table === 'vehicle_booking_months')) {
      await fetch(`${env.JOBLIO_API_URL}/rest/v1/${table}?year_month=neq.`, {
        method: 'DELETE',
        headers: {
          apikey: env.JOBLIO_API_KEY,
      'X-Joblio-Key': env.JOBLIO_API_KEY,
          'User-Agent': 'JoblioMigrate/1.0',
        },
      });
    }
  }
  // months tables wipe
  for (const table of ['rigging_months', 'vehicle_booking_months']) {
    await fetch(`${env.JOBLIO_API_URL}/rest/v1/${table}?year_month=not.is.null`, {
      method: 'DELETE',
      headers: {
        apikey: env.JOBLIO_API_KEY,
      'X-Joblio-Key': env.JOBLIO_API_KEY,
        'User-Agent': 'JoblioMigrate/1.0',
      },
    });
  }

  await apiInsert(env, 'users', users);
  await apiInsert(env, 'jobs', jobs);
  await apiInsert(env, 'stage_history', stageHistoryOk);
  await apiInsert(env, 'job_notes', notesOk);
  await apiInsert(env, 'note_mentions', mentionsOk);
  await apiInsert(env, 'job_proofs', proofsOk);
  await apiInsert(env, 'checklist_templates', checklistTemplatesOk);
  await apiInsert(env, 'checklist_template_items', checklistTemplateItemsOk);
  await apiInsert(env, 'job_checklist_items', jobChecklistOk);
  await apiInsert(env, 'rigging_months', riggingMonths);
  await apiInsert(env, 'rigging_installs', riggingInstallsOk);
  await apiInsert(env, 'rigging_alerts_sent', riggingAlertsOk);
  await apiInsert(env, 'vehicles', vehicles);
  await apiInsert(env, 'vehicle_booking_months', vehicleMonths);
  await apiInsert(env, 'vehicle_bookings', vehicleBookingsOk);

  // Write setval SQL for sequences
  const max = (rows) => (rows.length ? Math.max(...rows.map((r) => r.id)) : 1);
  const setvalSql = `
SELECT setval(pg_get_serial_sequence('public.users','id'), GREATEST((SELECT COALESCE(MAX(id),1) FROM public.users), 1));
SELECT setval(pg_get_serial_sequence('public.jobs','id'), GREATEST((SELECT COALESCE(MAX(id),1) FROM public.jobs), 1));
SELECT setval(pg_get_serial_sequence('public.stage_history','id'), GREATEST((SELECT COALESCE(MAX(id),1) FROM public.stage_history), 1));
SELECT setval(pg_get_serial_sequence('public.job_notes','id'), GREATEST((SELECT COALESCE(MAX(id),1) FROM public.job_notes), 1));
SELECT setval(pg_get_serial_sequence('public.note_mentions','id'), GREATEST((SELECT COALESCE(MAX(id),1) FROM public.note_mentions), 1));
SELECT setval(pg_get_serial_sequence('public.job_proofs','id'), GREATEST((SELECT COALESCE(MAX(id),1) FROM public.job_proofs), 1));
SELECT setval(pg_get_serial_sequence('public.checklist_templates','id'), GREATEST((SELECT COALESCE(MAX(id),1) FROM public.checklist_templates), 1));
SELECT setval(pg_get_serial_sequence('public.checklist_template_items','id'), GREATEST((SELECT COALESCE(MAX(id),1) FROM public.checklist_template_items), 1));
SELECT setval(pg_get_serial_sequence('public.job_checklist_items','id'), GREATEST((SELECT COALESCE(MAX(id),1) FROM public.job_checklist_items), 1));
SELECT setval(pg_get_serial_sequence('public.rigging_installs','id'), GREATEST((SELECT COALESCE(MAX(id),1) FROM public.rigging_installs), 1));
SELECT setval(pg_get_serial_sequence('public.rigging_alerts_sent','id'), GREATEST((SELECT COALESCE(MAX(id),1) FROM public.rigging_alerts_sent), 1));
SELECT setval(pg_get_serial_sequence('public.vehicles','id'), GREATEST((SELECT COALESCE(MAX(id),1) FROM public.vehicles), 1));
SELECT setval(pg_get_serial_sequence('public.vehicle_bookings','id'), GREATEST((SELECT COALESCE(MAX(id),1) FROM public.vehicle_bookings), 1));
`.trim();

  const setvalPath = path.join(ROOT, 'self-host', 'sql', 'reset_sequences.sql');
  fs.writeFileSync(setvalPath, setvalSql + '\n');
  fs.writeFileSync(path.join(ROOT, '.migrate-tmp', 'setval.sql'), setvalSql + '\n');

  console.log('\nVerifying Docker counts...');
  async function count(table) {
    const res = await fetch(`${env.JOBLIO_API_URL}/rest/v1/${table}?select=id`, {
      method: 'HEAD',
      headers: {
        apikey: env.JOBLIO_API_KEY,
      'X-Joblio-Key': env.JOBLIO_API_KEY,
        'User-Agent': 'JoblioMigrate/1.0',
        Prefer: 'count=exact',
      },
    });
    const range = res.headers.get('content-range') || '';
    const m = /\/(\d+|\*)/.exec(range);
    return m ? m[1] : '?';
  }
  for (const t of ['users', 'jobs', 'job_notes', 'job_proofs', 'rigging_installs', 'vehicle_bookings']) {
    console.log(`  ${t}: ${await count(t)} (sqlite had ${
      { users: users.length, jobs: jobs.length, job_notes: notesOk.length, job_proofs: proofsOk.length, rigging_installs: riggingInstallsOk.length, vehicle_bookings: vehicleBookingsOk.length }[t]
    })`);
  }

  console.log('\nDone. Share jobs.db was NOT modified. Staff keep using Joblio as today.');
  console.log('If IDs look off after migrate, run self-host/sql/reset_sequences.sql in psql:');
  console.log(setvalPath);
}

main().catch((err) => {
  console.error('\nFAILED:', err.message || err);
  process.exit(1);
});
