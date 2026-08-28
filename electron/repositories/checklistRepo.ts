import { getDatabase } from '../db/connection';
import { createDbHelpers } from '../db/helpers';

export interface ChecklistTemplate {
  id: number;
  name: string;
  created_by: number;
  created_at: string;
  item_count: number;
}

export interface ChecklistTemplateItem {
  id: number;
  template_id: number;
  body: string;
  sort_order: number;
}

export interface JobChecklistItem {
  id: number;
  job_id: number;
  body: string;
  done: number;
  sort_order: number;
  created_at: string;
}

export function listTemplates(): ChecklistTemplate[] {
  const db = getDatabase();
  const h = createDbHelpers(db);
  return h.all(
    `SELECT t.*,
       (SELECT COUNT(*) FROM checklist_template_items i WHERE i.template_id = t.id) AS item_count
     FROM checklist_templates t
     ORDER BY t.name COLLATE NOCASE`
  ) as ChecklistTemplate[];
}

export function createTemplate(
  name: string,
  items: string[],
  createdBy: number
): ChecklistTemplate {
  const db = getDatabase();
  const h = createDbHelpers(db);
  const result = h.run(
    `INSERT INTO checklist_templates (name, created_by) VALUES (?, ?)`,
    [name.trim(), createdBy]
  );
  const templateId = result.lastInsertRowid;
  items
    .map((b) => b.trim())
    .filter(Boolean)
    .forEach((body, i) => {
      h.run(
        `INSERT INTO checklist_template_items (template_id, body, sort_order) VALUES (?, ?, ?)`,
        [templateId, body, i]
      );
    });
  return listTemplates().find((t) => t.id === templateId)!;
}

export function deleteTemplate(id: number): void {
  const db = getDatabase();
  const h = createDbHelpers(db);
  h.run(`DELETE FROM checklist_templates WHERE id = ?`, [id]);
}

export function getTemplateItems(templateId: number): ChecklistTemplateItem[] {
  const db = getDatabase();
  const h = createDbHelpers(db);
  return h.all(
    `SELECT * FROM checklist_template_items WHERE template_id = ? ORDER BY sort_order, id`,
    [templateId]
  ) as ChecklistTemplateItem[];
}

export function listJobChecklist(jobId: number): JobChecklistItem[] {
  const db = getDatabase();
  const h = createDbHelpers(db);
  return h.all(
    `SELECT * FROM job_checklist_items WHERE job_id = ? ORDER BY sort_order, id`,
    [jobId]
  ) as JobChecklistItem[];
}

export function addJobChecklistItem(jobId: number, body: string): JobChecklistItem {
  const db = getDatabase();
  const h = createDbHelpers(db);
  const max = h.get(
    `SELECT COALESCE(MAX(sort_order), -1) AS m FROM job_checklist_items WHERE job_id = ?`,
    [jobId]
  ) as { m: number };
  const result = h.run(
    `INSERT INTO job_checklist_items (job_id, body, sort_order) VALUES (?, ?, ?)`,
    [jobId, body.trim(), (max?.m ?? -1) + 1]
  );
  return h.get(`SELECT * FROM job_checklist_items WHERE id = ?`, [result.lastInsertRowid]) as JobChecklistItem;
}

export function toggleJobChecklistItem(id: number, done: boolean): JobChecklistItem | undefined {
  const db = getDatabase();
  const h = createDbHelpers(db);
  h.run(`UPDATE job_checklist_items SET done = ? WHERE id = ?`, [done ? 1 : 0, id]);
  return h.get(`SELECT * FROM job_checklist_items WHERE id = ?`, [id]) as JobChecklistItem | undefined;
}

export function deleteJobChecklistItem(id: number): void {
  const db = getDatabase();
  const h = createDbHelpers(db);
  h.run(`DELETE FROM job_checklist_items WHERE id = ?`, [id]);
}

export function applyTemplateToJob(jobId: number, templateId: number): JobChecklistItem[] {
  const items = getTemplateItems(templateId);
  const db = getDatabase();
  const h = createDbHelpers(db);
  const max = h.get(
    `SELECT COALESCE(MAX(sort_order), -1) AS m FROM job_checklist_items WHERE job_id = ?`,
    [jobId]
  ) as { m: number };
  let order = (max?.m ?? -1) + 1;
  for (const item of items) {
    h.run(
      `INSERT INTO job_checklist_items (job_id, body, sort_order) VALUES (?, ?, ?)`,
      [jobId, item.body, order++]
    );
  }
  return listJobChecklist(jobId);
}
