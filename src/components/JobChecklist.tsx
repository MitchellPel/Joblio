import { useCallback, useEffect, useState } from 'react';
import { CheckSquare, Plus, Trash2, ListChecks } from 'lucide-react';
import type { ChecklistTemplate, JobChecklistItem } from '@/shared-types';

interface Props {
  token: string;
  jobId: number;
}

export default function JobChecklist({ token, jobId }: Props) {
  const [items, setItems] = useState<JobChecklistItem[]>([]);
  const [templates, setTemplates] = useState<ChecklistTemplate[]>([]);
  const [newBody, setNewBody] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [newTemplateName, setNewTemplateName] = useState('');
  const [savingTemplate, setSavingTemplate] = useState(false);

  const load = useCallback(async () => {
    const [list, tpls] = await Promise.all([
      window.tracker.listJobChecklist(token, jobId),
      window.tracker.listChecklistTemplates(token),
    ]);
    if (Array.isArray(list)) setItems(list);
    if (Array.isArray(tpls)) setTemplates(tpls);
  }, [token, jobId]);

  useEffect(() => {
    load();
  }, [load]);

  async function addItem() {
    if (!newBody.trim()) return;
    const result = await window.tracker.addChecklistItem(token, jobId, newBody.trim());
    if (!('error' in result)) {
      setItems((prev) => [...prev, result]);
      setNewBody('');
    }
  }

  async function toggle(item: JobChecklistItem) {
    const result = await window.tracker.toggleChecklistItem(token, item.id, !item.done);
    if (!('error' in result)) {
      setItems((prev) => prev.map((i) => (i.id === item.id ? result : i)));
    }
  }

  async function remove(id: number) {
    const result = await window.tracker.deleteChecklistItem(token, id);
    if (!('error' in result)) setItems((prev) => prev.filter((i) => i.id !== id));
  }

  async function applyTemplate() {
    const id = parseInt(templateId, 10);
    if (!id) return;
    const result = await window.tracker.applyChecklistTemplate(token, jobId, id);
    if (Array.isArray(result)) setItems(result);
  }

  async function saveAsTemplate() {
    if (!newTemplateName.trim() || items.length === 0) return;
    setSavingTemplate(true);
    const result = await window.tracker.createChecklistTemplate(token, {
      name: newTemplateName.trim(),
      items: items.map((i) => i.body),
    });
    setSavingTemplate(false);
    if (!('error' in result)) {
      setTemplates((prev) => [...prev, result].sort((a, b) => a.name.localeCompare(b.name)));
      setNewTemplateName('');
    }
  }

  const doneCount = items.filter((i) => i.done).length;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-medium text-ink">
          <CheckSquare className="h-4 w-4 text-ink-55" />
          Checklist
          {items.length > 0 && (
            <span className="rounded-pill bg-surface px-1.5 py-0.5 text-[11px] font-medium text-ink-55">
              {doneCount}/{items.length}
            </span>
          )}
        </h3>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
            className="jt-input !w-auto !py-1.5 text-xs"
          >
            <option value="">Apply template…</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.item_count})
              </option>
            ))}
          </select>
          <button type="button" className="jt-btn-ghost !py-1.5 text-xs" onClick={applyTemplate} disabled={!templateId}>
            <ListChecks className="h-3.5 w-3.5" />
            Apply
          </button>
        </div>
      </div>

      <ul className="mb-3 space-y-1.5">
        {items.map((item) => (
          <li
            key={item.id}
            className="group flex items-center gap-2 rounded-lg bg-surface-soft px-2.5 py-2"
          >
            <input
              type="checkbox"
              checked={!!item.done}
              onChange={() => toggle(item)}
              className="h-4 w-4 accent-[rgb(var(--color-brand))]"
            />
            <span className={`min-w-0 flex-1 text-sm ${item.done ? 'text-ink-40 line-through' : 'text-ink'}`}>
              {item.body}
            </span>
            <button
              type="button"
              onClick={() => remove(item.id)}
              className="rounded p-1 text-ink-40 opacity-0 transition-opacity hover:bg-ink-6 hover:text-danger group-hover:opacity-100"
              aria-label="Remove item"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </li>
        ))}
        {items.length === 0 && (
          <p className="text-sm italic text-ink-40">No checklist items yet.</p>
        )}
      </ul>

      <div className="mb-3 flex gap-2">
        <input
          value={newBody}
          onChange={(e) => setNewBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addItem();
            }
          }}
          placeholder="Add checklist item…"
          className="jt-input flex-1"
          spellCheck
        />
        <button type="button" className="jt-btn-accent" onClick={addItem} disabled={!newBody.trim()}>
          <Plus className="h-4 w-4" />
        </button>
      </div>

      {items.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-ink-10 p-2.5">
          <input
            value={newTemplateName}
            onChange={(e) => setNewTemplateName(e.target.value)}
            placeholder="Save current list as template…"
            className="jt-input flex-1 !py-1.5 text-xs"
          />
          <button
            type="button"
            className="jt-btn-ghost !py-1.5 text-xs"
            onClick={saveAsTemplate}
            disabled={!newTemplateName.trim() || savingTemplate}
          >
            Save template
          </button>
        </div>
      )}
    </div>
  );
}
