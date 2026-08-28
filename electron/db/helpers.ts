import type { Database as SqlJsDatabase } from 'sql.js';
import { scheduleSave } from './connection';

export function createDbHelpers(db: SqlJsDatabase) {
  function all(sql: string, params?: any[]): any[] {
    const stmt = db.prepare(sql);
    if (params) stmt.bind(params);
    const rows: any[] = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject());
    }
    stmt.free();
    return rows;
  }

  function get(sql: string, params?: any[]): any | undefined {
    const stmt = db.prepare(sql);
    if (params) stmt.bind(params);
    const result = stmt.step() ? stmt.getAsObject() : undefined;
    stmt.free();
    return result;
  }

  function run(sql: string, params?: any[]): { changes: number; lastInsertRowid: number } {
    db.run(sql, params);
    const info = get('SELECT changes() AS changes, last_insert_rowid() AS lastInsertRowid');
    scheduleSave();
    return { changes: info?.changes ?? 0, lastInsertRowid: info?.lastInsertRowid ?? 0 };
  }

  function exec(sql: string): void {
    db.exec(sql);
    scheduleSave();
  }

  return { all, get, run, exec };
}

export type DbHelpers = ReturnType<typeof createDbHelpers>;
