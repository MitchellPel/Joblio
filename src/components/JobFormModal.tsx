import { useState, useEffect, type ReactNode } from 'react';
import type { Job, User, NewJobInput, JobKind, DesignerStatus } from '@/shared-types';
import { useAuth } from '../context/AuthContext';
import AppModal from './AppModal';
import { JOB_KIND_OPTIONS, isJobKind } from './JobKindIcon';
import {
  DESIGNER_STATUS_OPTIONS,
  designerStatusPillClass,
  parseDesignerStatuses,
} from '../data/designerStatus';

const LEAD_OPTIONS = [
  { days: 14, label: '14 days', hint: 'Small jobs' },
  { days: 28, label: '28 days', hint: 'Standard' },
  { days: 48, label: '48 days', hint: 'Large jobs' },
] as const;

type LeadDays = (typeof LEAD_OPTIONS)[number]['days'];

function dateFromLeadDays(days: number): string {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** HTML date inputs need YYYY-MM-DD only (Postgres sometimes returns a full timestamp). */
function toDateInputValue(v: string | null | undefined): string {
  if (!v) return '';
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatDueLabel(iso: string): string {
  const day = toDateInputValue(iso);
  if (!day) return iso;
  const d = new Date(day + 'T12:00:00');
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

interface JobFormModalProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  editJob?: Job | null;
}

function FormSection({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div>
        <h3 className="jt-eyebrow">{title}</h3>
        {hint ? <p className="mt-0.5 text-xs text-ink-40">{hint}</p> : null}
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

export default function JobFormModal({ open, onClose, onSaved, editJob }: JobFormModalProps) {
  const { token } = useAuth();
  const [jobName, setJobName] = useState('');
  const [jobNumber, setJobNumber] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [leadDays, setLeadDays] = useState<LeadDays | null>(null);
  const [dueDate, setDueDate] = useState('');
  const [scopeNotes, setScopeNotes] = useState('');
  const [jobKind, setJobKind] = useState<JobKind | ''>('');
  const [designerStatuses, setDesignerStatuses] = useState<DesignerStatus[]>([]);
  const [assignedTo, setAssignedTo] = useState<number | ''>('');
  const [staff, setStaff] = useState<User[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  /** Version snapped when the modal opens — avoids stale/conflict issues mid-edit. */
  const [editVersion, setEditVersion] = useState(1);

  // Only hydrate when the modal opens — do NOT reset when `editJob` gets a new
  // object reference from a background refresh (that was wiping due-date edits).
  useEffect(() => {
    if (!open) return;
    void loadStaff();
    if (editJob) {
      setJobName(editJob.job_name);
      setJobNumber(editJob.client?.trim() || editJob.job_no || '');
      setContactName(editJob.contact_name || '');
      setContactPhone(editJob.contact_phone || '');
      setContactEmail(editJob.contact_email || '');
      setDueDate(toDateInputValue(editJob.due_date));
      setLeadDays(null);
      setScopeNotes(editJob.scope_notes || '');
      setJobKind(isJobKind(editJob.job_kind) ? editJob.job_kind : '');
      setDesignerStatuses(parseDesignerStatuses(editJob.designer_status));
      setAssignedTo(editJob.assigned_to ?? '');
      setEditVersion(editJob.version ?? 1);
      setError('');
    } else {
      resetForm();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally only when `open` flips
  }, [open]);

  function resetForm() {
    setJobName('');
    setJobNumber('');
    setContactName('');
    setContactPhone('');
    setContactEmail('');
    setLeadDays(null);
    setDueDate('');
    setScopeNotes('');
    setJobKind('');
    setDesignerStatuses([]);
    setAssignedTo('');
    setEditVersion(1);
    setError('');
  }

  function selectLead(days: LeadDays) {
    setLeadDays(days);
    setDueDate(dateFromLeadDays(days));
  }

  async function loadStaff() {
    if (!token) return;
    const users = await window.tracker.listStaff(token);
    if (Array.isArray(users)) setStaff(users as User[]);
  }

  async function handleSave() {
    if (!jobName.trim()) {
      setError('Job name is required.');
      return;
    }
    if (!jobNumber.trim()) {
      setError('Job number is required.');
      return;
    }
    if (!jobKind) {
      setError('Choose Vehicle, Sign, or Vinyl before saving.');
      return;
    }
    if (!editJob && !dueDate) {
      setError('Choose a lead time (14, 28, or 48 days).');
      return;
    }
    if (!token) {
      setError('Session expired. Please log in again.');
      return;
    }

    setSaving(true);
    setError('');
    const jobNo = jobNumber.trim();
    const due = toDateInputValue(dueDate) || null;

    if (editJob) {
      const payload = {
        id: editJob.id,
        version: editVersion,
        job_name: jobName.trim(),
        job_no: jobNo,
        client: jobNo,
        contact_name: contactName.trim() || null,
        contact_phone: contactPhone.trim() || null,
        contact_email: contactEmail.trim() || null,
        due_date: due,
        scope_notes: scopeNotes.trim() || null,
        job_kind: jobKind || null,
        designer_status: designerStatuses,
        assigned_to: assignedTo === '' ? null : (assignedTo as number),
      };

      let result = await window.tracker.updateJob(token, payload);

      // One automatic retry if someone else (or a status toggle) bumped the version.
      if ('error' in result && String(result.error).startsWith('CONFLICT:')) {
        const fresh = await window.tracker.getJob(token, editJob.id);
        if (fresh && !('error' in fresh)) {
          const nextVersion = (fresh as Job).version;
          setEditVersion(nextVersion);
          result = await window.tracker.updateJob(token, {
            ...payload,
            version: nextVersion,
          });
        }
      }

      if ('error' in result) {
        setError(result.error);
        setSaving(false);
        return;
      }
    } else {
      const data: NewJobInput = {
        job_no: jobNo,
        job_name: jobName.trim(),
        client: jobNo,
        contact_name: contactName.trim() || null,
        contact_phone: contactPhone.trim() || null,
        contact_email: contactEmail.trim() || null,
        due_date: due,
        scope_notes: scopeNotes.trim() || null,
        job_kind: jobKind || null,
        designer_status: designerStatuses,
        assigned_to: assignedTo === '' ? null : (assignedTo as number),
      };
      const result = await window.tracker.createJob(token, data);
      if ('error' in result) {
        setError(result.error);
        setSaving(false);
        return;
      }
    }

    setSaving(false);
    onSaved();
    onClose();
  }

  const canSubmit =
    jobName.trim().length > 0 &&
    jobNumber.trim().length > 0 &&
    !!jobKind &&
    (editJob ? true : !!dueDate);

  return (
    <AppModal
      open={open}
      onClose={onClose}
      maxWidth="xl"
      title={editJob ? 'Edit job' : 'New job'}
      subtitle={editJob ? jobNumber || editJob.job_no : 'Add a job to the board'}
      footer={
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {error ? (
            <p className="min-w-0 flex-1 text-sm text-danger">{error}</p>
          ) : !canSubmit && !jobKind ? (
            <p className="min-w-0 flex-1 text-sm text-ink-40">Choose Vehicle, Sign, or Vinyl to enable Save.</p>
          ) : (
            <span className="hidden sm:block" />
          )}
          <div className="flex shrink-0 justify-end gap-2">
            <button type="button" onClick={onClose} className="jt-btn-ghost">
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !canSubmit}
              className="jt-btn-accent disabled:opacity-50"
            >
              {saving ? 'Saving…' : editJob ? 'Save changes' : 'Create job'}
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-6">
        <FormSection title="Job" hint="What staff will see on the board">
          <div>
            <label className="jt-label" htmlFor="job-form-number">
              Job number *
            </label>
            <input
              id="job-form-number"
              type="text"
              value={jobNumber}
              onChange={(e) => setJobNumber(e.target.value)}
              className="jt-input font-mono"
              placeholder="e.g. SO0001587"
              spellCheck={false}
              autoFocus={!editJob}
            />
          </div>
          <div>
            <label className="jt-label" htmlFor="job-form-name">
              Job name *
            </label>
            <input
              id="job-form-name"
              type="text"
              value={jobName}
              onChange={(e) => setJobName(e.target.value)}
              className="jt-input text-base font-medium"
              placeholder="e.g. Main Street Cafe Signs"
              spellCheck
            />
          </div>
          <div>
            <label className="jt-label">Type *</label>
            <div className="grid grid-cols-3 gap-2">
              {JOB_KIND_OPTIONS.map(({ key, label, hint, Icon }) => {
                const selected = jobKind === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setJobKind(key)}
                    className={`flex flex-col items-center gap-1 rounded-xl border px-2 py-2.5 text-center transition-colors ${
                      selected
                        ? 'border-brand bg-brand text-white shadow-sm'
                        : 'border-ink-10 bg-card text-ink hover:border-ink-20 hover:bg-ink-6'
                    }`}
                  >
                    <Icon className="h-6 w-6" />
                    <span className="text-sm font-semibold leading-tight">{label}</span>
                    <span
                      className={`text-[10px] leading-tight ${
                        selected ? 'text-white/80' : 'text-ink-40'
                      }`}
                    >
                      {hint}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <label className="jt-label">Status</label>
            <div className="flex flex-wrap gap-1.5">
              {DESIGNER_STATUS_OPTIONS.map(({ key, label }) => {
                const selected = designerStatuses.includes(key);
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() =>
                      setDesignerStatuses((prev) =>
                        prev.includes(key) ? prev.filter((s) => s !== key) : [...prev, key]
                      )
                    }
                    className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                      selected
                        ? designerStatusPillClass(key)
                        : 'bg-ink-6 text-ink-55 hover:bg-ink-10 hover:text-ink'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            <p className="mt-1.5 text-[11px] text-ink-40">
              Pick one or more. Urgent turns the board card red.
            </p>
            <p className="mt-1 text-[11px] text-ink-40">
              Optional — pick one or more. Urgent turns the board card red.
            </p>
          </div>
        </FormSection>

        <div className="border-t border-ink-10" />

        <FormSection
          title="Schedule"
          hint={editJob ? 'Update lead time or pick a due date' : 'Pick a lead time — due date is set from today'}
        >
          <div>
            <label className="jt-label">Lead time{editJob ? '' : ' *'}</label>
            <div className="grid grid-cols-3 gap-2">
              {LEAD_OPTIONS.map(({ days, label, hint }) => {
                const selected = leadDays === days;
                return (
                  <button
                    key={days}
                    type="button"
                    onClick={() => selectLead(days)}
                    className={`rounded-xl border px-2 py-2.5 text-center transition-colors ${
                      selected
                        ? 'border-brand bg-brand text-white shadow-sm'
                        : 'border-ink-10 bg-card text-ink hover:border-ink-20 hover:bg-ink-6'
                    }`}
                  >
                    <span className="block text-sm font-semibold leading-tight">{label}</span>
                    <span
                      className={`mt-0.5 block text-[10px] leading-tight ${
                        selected ? 'text-white/80' : 'text-ink-40'
                      }`}
                    >
                      {hint}
                    </span>
                  </button>
                );
              })}
            </div>
            {dueDate ? (
              <p className="mt-2 text-sm text-ink-55">
                Due{' '}
                <span className="font-medium text-ink">{formatDueLabel(dueDate)}</span>
              </p>
            ) : null}
          </div>

          {editJob ? (
            <div>
              <label className="jt-label" htmlFor="job-form-due">
                Due date
              </label>
              <input
                id="job-form-due"
                type="date"
                value={dueDate}
                onChange={(e) => {
                  setLeadDays(null);
                  setDueDate(e.target.value);
                }}
                className="jt-input"
              />
              <p className="mt-1 text-[11px] text-ink-40">
                Change the date above or pick a lead time, then click Save changes.
              </p>
            </div>
          ) : null}

          <div>
            <label className="jt-label" htmlFor="job-form-assignee">
              Assigned to
            </label>
            <select
              id="job-form-assignee"
              value={assignedTo}
              onChange={(e) => setAssignedTo(e.target.value ? parseInt(e.target.value, 10) : '')}
              className="jt-input bg-input/80"
            >
              <option value="">Unassigned</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.full_name}
                </option>
              ))}
            </select>
          </div>
        </FormSection>

        <div className="border-t border-ink-10" />

        <FormSection title="Contact" hint="Optional — who to call about this job">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="min-w-0">
              <label className="jt-label" htmlFor="job-form-contact-name">
                Name
              </label>
              <input
                id="job-form-contact-name"
                type="text"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                className="jt-input"
                spellCheck
              />
            </div>
            <div className="min-w-0">
              <label className="jt-label" htmlFor="job-form-contact-phone">
                Phone
              </label>
              <input
                id="job-form-contact-phone"
                type="text"
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                className="jt-input"
                spellCheck={false}
              />
            </div>
            <div className="min-w-0 sm:col-span-2">
              <label className="jt-label" htmlFor="job-form-contact-email">
                Email
              </label>
              <input
                id="job-form-contact-email"
                type="email"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                className="jt-input"
                spellCheck={false}
              />
            </div>
          </div>
        </FormSection>

        <div className="border-t border-ink-10" />

        <FormSection title="Notes" hint="Optional scope for the team">
          <div>
            <label className="jt-label" htmlFor="job-form-scope">
              Scope notes
            </label>
            <textarea
              id="job-form-scope"
              value={scopeNotes}
              onChange={(e) => setScopeNotes(e.target.value)}
              rows={3}
              className="jt-input resize-none"
              placeholder="Brief description of the job scope…"
              spellCheck
            />
          </div>
        </FormSection>
      </div>
    </AppModal>
  );
}
