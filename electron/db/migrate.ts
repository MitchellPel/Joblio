import type { Database as SqlJsDatabase } from 'sql.js';
import bcrypt from 'bcryptjs';

const MIGRATIONS = [
  {
    version: 1,
    sql: `
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('admin','staff')) DEFAULT 'staff',
        full_name TEXT NOT NULL DEFAULT '',
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS jobs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_no TEXT NOT NULL UNIQUE,
        job_name TEXT NOT NULL DEFAULT '',
        client TEXT NOT NULL DEFAULT '',
        contact_name TEXT,
        contact_phone TEXT,
        contact_email TEXT,
        stage TEXT NOT NULL DEFAULT 'new'
          CHECK(stage IN ('new','design','production','install','collection','completed')),
        assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL,
        due_date TEXT,
        scope_notes TEXT,
        created_by INTEGER NOT NULL REFERENCES users(id),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS stage_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
        from_stage TEXT,
        to_stage TEXT NOT NULL,
        changed_by INTEGER NOT NULL REFERENCES users(id),
        changed_at TEXT NOT NULL DEFAULT (datetime('now')),
        note TEXT
      );

      CREATE TABLE IF NOT EXISTS job_notes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
        author_id INTEGER NOT NULL REFERENCES users(id),
        body TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_jobs_stage ON jobs(stage);
      CREATE INDEX IF NOT EXISTS idx_jobs_assigned ON jobs(assigned_to);
      CREATE INDEX IF NOT EXISTS idx_stage_history_job ON stage_history(job_id);
      CREATE INDEX IF NOT EXISTS idx_job_notes_job ON job_notes(job_id);
    `,
  },
  {
    version: 2,
    sql: `
      ALTER TABLE jobs ADD COLUMN archived_at TEXT;

      ALTER TABLE users ADD COLUMN can_archive INTEGER NOT NULL DEFAULT 0;
    `,
  },
  {
    version: 3,
    sql: `
      CREATE TABLE IF NOT EXISTS job_proofs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
        file_name TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        data BLOB NOT NULL,
        size INTEGER NOT NULL DEFAULT 0,
        uploaded_by INTEGER NOT NULL REFERENCES users(id),
        uploaded_name TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_job_proofs_job ON job_proofs(job_id);
    `,
  },
  {
    version: 4,
    sql: `
      ALTER TABLE jobs ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
    `,
  },
  {
    version: 5,
    sql: `
      ALTER TABLE users ADD COLUMN can_move_any INTEGER NOT NULL DEFAULT 0;
    `,
  },
  {
    version: 6,
    sql: `
      ALTER TABLE users ADD COLUMN can_edit_rigging INTEGER NOT NULL DEFAULT 0;

      CREATE TABLE IF NOT EXISTS rigging_months (
        year_month TEXT PRIMARY KEY,
        status TEXT NOT NULL CHECK(status IN ('active','archived')) DEFAULT 'active',
        archived_at TEXT
      );

      CREATE TABLE IF NOT EXISTS rigging_installs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id INTEGER NOT NULL UNIQUE REFERENCES jobs(id) ON DELETE CASCADE,
        scheduled_date TEXT NOT NULL,
        note TEXT,
        created_by INTEGER NOT NULL REFERENCES users(id),
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_rigging_installs_date ON rigging_installs(scheduled_date);

      CREATE TABLE IF NOT EXISTS rigging_alerts_sent (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id),
        install_id INTEGER NOT NULL REFERENCES rigging_installs(id) ON DELETE CASCADE,
        alert_type TEXT NOT NULL CHECK(alert_type IN ('5day','2day','dayof')),
        alert_date TEXT NOT NULL,
        sent_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(user_id, install_id, alert_type, alert_date)
      );
    `,
  },
  {
    version: 7,
    sql: `
      CREATE TABLE IF NOT EXISTS note_mentions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        note_id INTEGER NOT NULL REFERENCES job_notes(id) ON DELETE CASCADE,
        job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
        mentioned_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_by INTEGER NOT NULL REFERENCES users(id),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        seen INTEGER NOT NULL DEFAULT 0
      );

      CREATE INDEX IF NOT EXISTS idx_note_mentions_user ON note_mentions(mentioned_user_id, seen);
      CREATE INDEX IF NOT EXISTS idx_note_mentions_job ON note_mentions(job_id);
    `,
  },
  {
    version: 8,
    sql: `
      CREATE TABLE IF NOT EXISTS checklist_templates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        created_by INTEGER NOT NULL REFERENCES users(id),
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS checklist_template_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        template_id INTEGER NOT NULL REFERENCES checklist_templates(id) ON DELETE CASCADE,
        body TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS job_checklist_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
        body TEXT NOT NULL,
        done INTEGER NOT NULL DEFAULT 0,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_job_checklist_job ON job_checklist_items(job_id);
      CREATE INDEX IF NOT EXISTS idx_checklist_template_items ON checklist_template_items(template_id);
    `,
  },
  {
    version: 9,
    sql: `
      ALTER TABLE job_proofs ADD COLUMN thumb BLOB;
    `,
  },
  {
    // Marker: proofs live as files next to jobs.db (see migrateProofsToFilesAsync).
    // No schema change required — empty BLOBs satisfy NOT NULL.
    version: 10,
    sql: `SELECT 1;`,
  },
  {
    version: 11,
    sql: `
      ALTER TABLE jobs ADD COLUMN pinned_brief TEXT;
    `,
  },
  {
    version: 12,
    sql: `
      ALTER TABLE users ADD COLUMN can_edit_vehicle_bookings INTEGER NOT NULL DEFAULT 0;

      CREATE TABLE IF NOT EXISTS vehicles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        active INTEGER NOT NULL DEFAULT 1,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS vehicle_booking_months (
        year_month TEXT PRIMARY KEY,
        status TEXT NOT NULL CHECK(status IN ('active','archived')) DEFAULT 'active',
        archived_at TEXT
      );

      CREATE TABLE IF NOT EXISTS vehicle_bookings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
        scheduled_date TEXT NOT NULL,
        booked_for TEXT,
        note TEXT,
        created_by INTEGER NOT NULL REFERENCES users(id),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(vehicle_id, scheduled_date)
      );

      CREATE INDEX IF NOT EXISTS idx_vehicle_bookings_date ON vehicle_bookings(scheduled_date);
    `,
  },
  {
    version: 13,
    sql: `
      ALTER TABLE vehicle_bookings ADD COLUMN job_id INTEGER REFERENCES jobs(id) ON DELETE SET NULL;
      CREATE INDEX IF NOT EXISTS idx_vehicle_bookings_job ON vehicle_bookings(job_id);
    `,
  },
  {
    version: 14,
    sql: `
      CREATE TABLE vehicle_bookings_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id INTEGER NOT NULL UNIQUE REFERENCES jobs(id) ON DELETE CASCADE,
        scheduled_date TEXT NOT NULL,
        note TEXT,
        created_by INTEGER NOT NULL REFERENCES users(id),
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      INSERT OR IGNORE INTO vehicle_bookings_new (id, job_id, scheduled_date, note, created_by, created_at)
      SELECT id, job_id, scheduled_date, COALESCE(note, booked_for), created_by, created_at
      FROM vehicle_bookings
      WHERE job_id IS NOT NULL;

      DROP TABLE vehicle_bookings;
      ALTER TABLE vehicle_bookings_new RENAME TO vehicle_bookings;

      CREATE INDEX IF NOT EXISTS idx_vehicle_bookings_date ON vehicle_bookings(scheduled_date);
      CREATE INDEX IF NOT EXISTS idx_vehicle_bookings_job ON vehicle_bookings(job_id);
    `,
  },
  {
    version: 15,
    sql: `
      ALTER TABLE jobs ADD COLUMN job_kind TEXT CHECK(job_kind IS NULL OR job_kind IN ('vehicle','sign'));
    `,
  },
  {
    // Expand job_kind to include vinyl (SQLite can't alter CHECK in place).
    version: 16,
    sql: `
      ALTER TABLE jobs ADD COLUMN job_kind_tmp TEXT;
      UPDATE jobs SET job_kind_tmp = job_kind;
      ALTER TABLE jobs DROP COLUMN job_kind;
      ALTER TABLE jobs ADD COLUMN job_kind TEXT CHECK(job_kind IS NULL OR job_kind IN ('vehicle','sign','vinyl'));
      UPDATE jobs SET job_kind = job_kind_tmp;
      ALTER TABLE jobs DROP COLUMN job_kind_tmp;
    `,
  },
  {
    version: 17,
    sql: `
      ALTER TABLE jobs ADD COLUMN designer_status TEXT
        CHECK(designer_status IS NULL OR designer_status IN ('proofing','on_hold','waiting_client','approved'));
    `,
  },
  {
    // Expand designer_status with Ordered / Printed / Cut / Welded / Application (keep existing).
    version: 18,
    sql: `
      ALTER TABLE jobs ADD COLUMN designer_status_tmp TEXT;
      UPDATE jobs SET designer_status_tmp = CASE
        WHEN designer_status IN (
          'proofing','on_hold','waiting_client','approved',
          'ordered','printed','cut','welded','application'
        ) THEN designer_status
        ELSE NULL
      END;
      ALTER TABLE jobs DROP COLUMN designer_status;
      ALTER TABLE jobs ADD COLUMN designer_status TEXT
        CHECK(designer_status IS NULL OR designer_status IN (
          'proofing','on_hold','waiting_client','approved',
          'ordered','printed','cut','welded','application'
        ));
      UPDATE jobs SET designer_status = designer_status_tmp;
      ALTER TABLE jobs DROP COLUMN designer_status_tmp;
    `,
  },
  {
    version: 19,
    sql: `
      ALTER TABLE users ADD COLUMN can_create_orders INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE users ADD COLUMN can_manage_orders INTEGER NOT NULL DEFAULT 0;

      CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id INTEGER NOT NULL REFERENCES jobs(id),
        items_body TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'open'
          CHECK(status IN ('open','placed','done')),
        created_by INTEGER NOT NULL REFERENCES users(id),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        archived_at TEXT,
        version INTEGER NOT NULL DEFAULT 1
      );
      CREATE INDEX IF NOT EXISTS idx_orders_archived ON orders(archived_at);
      CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
      CREATE INDEX IF NOT EXISTS idx_orders_job ON orders(job_id);

      CREATE TABLE IF NOT EXISTS order_seen (
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        seen_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (user_id, order_id)
      );
    `,
  },
  {
    // Multi-select statuses (JSON array in designer_status TEXT) + optional order job/name.
    version: 20,
    sql: `
      ALTER TABLE jobs ADD COLUMN designer_status_tmp TEXT;
      UPDATE jobs SET designer_status_tmp = designer_status;
      ALTER TABLE jobs DROP COLUMN designer_status;
      ALTER TABLE jobs ADD COLUMN designer_status TEXT;
      UPDATE jobs SET designer_status = designer_status_tmp;
      ALTER TABLE jobs DROP COLUMN designer_status_tmp;

      PRAGMA foreign_keys=OFF;
      CREATE TABLE orders_v20 (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id INTEGER REFERENCES jobs(id),
        order_name TEXT NOT NULL DEFAULT '',
        items_body TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'open'
          CHECK(status IN ('open','placed','done')),
        created_by INTEGER NOT NULL REFERENCES users(id),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        archived_at TEXT,
        version INTEGER NOT NULL DEFAULT 1
      );
      INSERT INTO orders_v20 (
        id, job_id, order_name, items_body, status, created_by,
        created_at, updated_at, archived_at, version
      )
      SELECT
        id, job_id, '', items_body, status, created_by,
        created_at, updated_at, archived_at, version
      FROM orders;
      DROP TABLE orders;
      ALTER TABLE orders_v20 RENAME TO orders;
      CREATE INDEX IF NOT EXISTS idx_orders_archived ON orders(archived_at);
      CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
      CREATE INDEX IF NOT EXISTS idx_orders_job ON orders(job_id);
      PRAGMA foreign_keys=ON;
    `,
  },
  {
    version: 21,
    sql: `
      ALTER TABLE users ADD COLUMN can_use_ai INTEGER NOT NULL DEFAULT 0;
    `,
  },
  {
    version: 22,
    sql: `
      CREATE TABLE IF NOT EXISTS app_feedback (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        kind TEXT NOT NULL DEFAULT 'bug'
          CHECK(kind IN ('bug','change')),
        body TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'open'
          CHECK(status IN ('open','done')),
        created_by INTEGER NOT NULL REFERENCES users(id),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        done_by INTEGER REFERENCES users(id),
        done_at TEXT,
        version INTEGER NOT NULL DEFAULT 1
      );
      CREATE INDEX IF NOT EXISTS idx_app_feedback_status ON app_feedback(status);
      CREATE INDEX IF NOT EXISTS idx_app_feedback_created_by ON app_feedback(created_by);

      CREATE TABLE IF NOT EXISTS feedback_seen (
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        feedback_id INTEGER NOT NULL REFERENCES app_feedback(id) ON DELETE CASCADE,
        seen_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (user_id, feedback_id)
      );
    `,
  },
  {
    version: 23,
    sql: `
      ALTER TABLE users ADD COLUMN can_delete_notes INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE rigging_installs ADD COLUMN duration_days INTEGER NOT NULL DEFAULT 1;
    `,
  },
  {
    version: 24,
    sql: `
      ALTER TABLE users ADD COLUMN board_color TEXT;
    `,
  },
  {
    version: 25,
    sql: `
      CREATE TABLE IF NOT EXISTS quote_sizes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_name TEXT NOT NULL,
        scope TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'open'
          CHECK(status IN ('open','done')),
        has_image INTEGER NOT NULL DEFAULT 0,
        file_name TEXT NOT NULL DEFAULT '',
        mime_type TEXT NOT NULL DEFAULT '',
        size INTEGER NOT NULL DEFAULT 0,
        created_by INTEGER NOT NULL REFERENCES users(id),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        archived_at TEXT,
        version INTEGER NOT NULL DEFAULT 1
      );
      CREATE INDEX IF NOT EXISTS idx_quote_sizes_archived ON quote_sizes(archived_at);
      CREATE INDEX IF NOT EXISTS idx_quote_sizes_status ON quote_sizes(status);

      CREATE TABLE IF NOT EXISTS quote_size_notes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        quote_size_id INTEGER NOT NULL REFERENCES quote_sizes(id) ON DELETE CASCADE,
        author_id INTEGER NOT NULL REFERENCES users(id),
        body TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_quote_size_notes_qs ON quote_size_notes(quote_size_id);

      CREATE TABLE IF NOT EXISTS quote_size_mentions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        note_id INTEGER NOT NULL REFERENCES quote_size_notes(id) ON DELETE CASCADE,
        quote_size_id INTEGER NOT NULL REFERENCES quote_sizes(id) ON DELETE CASCADE,
        mentioned_user_id INTEGER NOT NULL REFERENCES users(id),
        created_by INTEGER NOT NULL REFERENCES users(id),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        seen INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_quote_size_mentions_user ON quote_size_mentions(mentioned_user_id, seen);

      CREATE TABLE IF NOT EXISTS quote_size_seen (
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        quote_size_id INTEGER NOT NULL REFERENCES quote_sizes(id) ON DELETE CASCADE,
        seen_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (user_id, quote_size_id)
      );
    `,
  },
  {
    version: 26,
    sql: `
      ALTER TABLE quote_size_notes ADD COLUMN has_image INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE quote_size_notes ADD COLUMN file_name TEXT NOT NULL DEFAULT '';
      ALTER TABLE quote_size_notes ADD COLUMN mime_type TEXT NOT NULL DEFAULT '';
      ALTER TABLE quote_size_notes ADD COLUMN size INTEGER NOT NULL DEFAULT 0;
    `,
  },
  {
    version: 27,
    sql: `
      ALTER TABLE users ADD COLUMN can_manage_quote_sizes INTEGER NOT NULL DEFAULT 0;
    `,
  },
];

/**
 * Apply schema migrations in-memory only.
 * Caller is responsible for persisting (so we don't fight the file lock).
 * Returns true when anything was actually applied, so callers can skip
 * the expensive network-share write on a normal (no-op) startup.
 */
export function migrate(db: SqlJsDatabase): boolean {
  let changed = false;

  db.run(
    `CREATE TABLE IF NOT EXISTS _migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );`
  );

  const applied = new Set<number>();
  const stmt = db.prepare('SELECT version FROM _migrations');
  while (stmt.step()) {
    applied.add((stmt.getAsObject() as { version: number }).version);
  }
  stmt.free();

  for (const m of MIGRATIONS) {
    if (applied.has(m.version)) continue;
    changed = true;

    const statements = m.sql.split(';').filter((s) => s.trim().length > 0);
    for (const statement of statements) {
      try {
        db.run(statement + ';');
      } catch (err) {
        console.error(`[migrate] Error running migration ${m.version}:`, err);
      }
    }
    db.run('INSERT OR IGNORE INTO _migrations (version) VALUES (?)', [m.version]);
  }

  // Seed default admin if no users exist
  const countStmt = db.prepare('SELECT COUNT(*) AS cnt FROM users');
  const hasRow = countStmt.step();
  const cnt = hasRow ? (countStmt.getAsObject() as { cnt: number }).cnt : 0;
  countStmt.free();

  if (cnt === 0) {
    const defaultHash = bcrypt.hashSync('admin123', 10);
    db.run(
      "INSERT INTO users (username, password_hash, role, full_name) VALUES (?, ?, 'admin', ?)",
      ['admin', defaultHash, 'Administrator']
    );
    console.log('[seed] Created default admin user (username: admin, password: admin123)');
    changed = true;
  }

  return changed;
}
