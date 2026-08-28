import type { RiggingInstall } from '@/shared-types';
import { formatDisplayDate } from '../utils/dates';

interface InstallTodoListProps {
  date: string;
  installs: RiggingInstall[];
  printId?: string;
}

function jobNumber(install: RiggingInstall): string | null {
  const n = install.client?.trim();
  return n || null;
}

export default function InstallTodoList({ date, installs, printId = 'install-todo-print' }: InstallTodoListProps) {
  return (
    <div id={printId} className="install-todo-print">
      <div className="mb-4 border-b border-ink-10 pb-3">
        <h2 className="font-display text-lg font-medium text-ink">Installs — To Do</h2>
        <p className="mt-1 text-sm text-ink-55">{formatDisplayDate(date)}</p>
        <p className="mt-0.5 text-xs text-ink-40">
          {installs.length} job{installs.length === 1 ? '' : 's'} scheduled
        </p>
      </div>

      {installs.length === 0 ? (
        <p className="py-8 text-center text-sm text-ink-40">No installs scheduled for this day.</p>
      ) : (
        <ol className="space-y-3">
          {installs.map((install, index) => (
            <li
              key={install.id}
              className="flex gap-3 rounded-lg border border-ink-10 bg-card px-3 py-2.5 print:break-inside-avoid"
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand/15 text-xs font-semibold text-brand">
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                {jobNumber(install) && (
                  <p className="font-mono text-sm font-medium text-ink">{jobNumber(install)}</p>
                )}
                <p className={`text-sm text-ink-90 ${jobNumber(install) ? '' : 'font-medium'}`}>
                  {install.job_name}
                </p>
                {install.note?.trim() && (
                  <p className="mt-1 text-xs text-ink-55">{install.note.trim()}</p>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export function printInstallTodo(
  printId = 'install-todo-print',
  fallback?: { date: string; installs: RiggingInstall[] }
): void {
  const el = document.getElementById(printId);
  const existing = document.getElementById('install-todo-print-frame');
  existing?.remove();

  const frame = document.createElement('iframe');
  frame.id = 'install-todo-print-frame';
  frame.style.position = 'fixed';
  frame.style.right = '0';
  frame.style.bottom = '0';
  frame.style.width = '0';
  frame.style.height = '0';
  frame.style.border = '0';
  document.body.appendChild(frame);

  const doc = frame.contentDocument;
  if (!doc) {
    frame.remove();
    window.print();
    return;
  }

  let bodyHtml: string;
  if (fallback) {
    const { date, installs } = fallback;
    bodyHtml = `
      <h2>Installs — To Do</h2>
      <p class="meta">${formatDisplayDate(date)}</p>
      <p class="meta">${installs.length} job${installs.length === 1 ? '' : 's'} scheduled</p>
      <ol>
        ${installs
          .map(
            (install, index) => {
              const num = jobNumber(install);
              return `
          <li>
            <span class="num">${index + 1}</span>
            <div>
              ${num ? `<div class="job-no">${num}</div>` : ''}
              <div class="job-name">${install.job_name}</div>
              ${install.note?.trim() ? `<div class="note">${install.note.trim()}</div>` : ''}
            </div>
          </li>`;
            }
          )
          .join('')}
      </ol>`;
  } else if (el) {
    bodyHtml = el.innerHTML;
  } else {
    frame.remove();
    window.print();
    return;
  }

  doc.open();
  doc.write(`<!DOCTYPE html>
<html>
<head>
  <title>Installs To Do</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 24px; color: #1a1a1a; }
    h2 { margin: 0 0 4px; font-size: 20px; }
    p, .meta { margin: 0; color: #666; font-size: 13px; }
    .meta + .meta { margin-top: 2px; margin-bottom: 12px; }
    ol { list-style: none; padding: 0; margin: 16px 0 0; }
    li { display: flex; gap: 12px; padding: 10px 0; border-bottom: 1px solid #ddd; page-break-inside: avoid; }
    .num { width: 24px; height: 24px; border-radius: 999px; background: #eee; text-align: center; line-height: 24px; font-size: 12px; font-weight: 600; flex-shrink: 0; }
    .job-no { font-family: ui-monospace, monospace; font-weight: 600; font-size: 14px; }
    .job-name { font-size: 14px; margin-top: 2px; }
    .note { font-size: 12px; color: #666; margin-top: 4px; }
  </style>
</head>
<body>${bodyHtml}</body>
</html>`);
  doc.close();

  frame.contentWindow?.focus();
  frame.contentWindow?.print();

  setTimeout(() => frame.remove(), 1000);
}
