/**
 * Opens a print-only delivery note for a job (separate window — does not change on-screen job detail).
 */
import type { Job } from '@/shared-types';
import { stageLabel } from '../data/stages';

export function printJobSheet(opts: { job: Job }) {
  const { job } = opts;
  const win = window.open('', '_blank', 'width=900,height=1100');
  if (!win) return;

  const esc = (s: string) =>
    s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  const contact =
    [job.contact_name, job.contact_phone, job.contact_email].filter(Boolean).join(' · ') || '—';

  win.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Ikwezi Signs - Delivery Note — ${esc(job.job_no || job.job_name)}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: "Segoe UI", system-ui, sans-serif;
      color: #1a1a1a;
      margin: 0;
      padding: 28px 32px;
      font-size: 13px;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }
    .header {
      text-align: center;
      border-bottom: 2px solid #1a1a1a;
      padding-bottom: 14px;
      margin-bottom: 20px;
    }
    .header h1 {
      font-size: 22px;
      font-weight: 700;
      margin: 0;
      letter-spacing: 0.02em;
    }
    .header .sub {
      margin-top: 6px;
      font-size: 11px;
      color: #666;
    }
    h2 {
      font-size: 14px;
      margin: 22px 0 8px;
      border-bottom: 1px solid #ddd;
      padding-bottom: 4px;
    }
    .job-title {
      font-size: 18px;
      font-weight: 600;
      margin: 0 0 4px;
    }
    .grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px 28px;
      margin-top: 14px;
    }
    .label { color: #666; font-size: 11px; }
    .value { font-size: 13px; margin-top: 2px; }
    .muted { color: #888; }
    .scope {
      white-space: pre-wrap;
      margin: 0;
      line-height: 1.45;
    }
    .main { flex: 1 1 auto; }
    .sign-block {
      margin-top: 48px;
      padding-top: 20px;
      border-top: 1px solid #ccc;
      page-break-inside: avoid;
    }
    .sign-row {
      display: flex;
      align-items: baseline;
      gap: 8px;
      margin: 18px 0;
      font-size: 14px;
    }
    .sign-label {
      flex: 0 0 auto;
      font-weight: 600;
      min-width: 6.5em;
    }
    .sign-line {
      flex: 1 1 auto;
      border-bottom: 1px solid #1a1a1a;
      min-height: 1.4em;
    }
    .date-line {
      letter-spacing: 0.06em;
      font-size: 14px;
    }
    @media print {
      body { padding: 12mm 14mm; }
      .sign-block { margin-top: auto; padding-top: 24px; }
    }
  </style>
</head>
<body>
  <div class="main">
    <div class="header">
      <h1>Ikwezi Signs - Delivery Note</h1>
      <p class="sub">Printed ${esc(new Date().toLocaleString())}</p>
    </div>

    <p class="job-title">${esc(job.job_no ? `${job.job_no} — ${job.job_name}` : job.job_name)}</p>

    <div class="grid">
      <div>
        <div class="label">Job number</div>
        <div class="value">${esc(job.client?.trim() || job.job_no || '—')}</div>
      </div>
      <div>
        <div class="label">Stage</div>
        <div class="value">${esc(stageLabel(job.stage))}</div>
      </div>
      <div>
        <div class="label">Assigned</div>
        <div class="value">${esc(job.assigned_name || '—')}</div>
      </div>
      <div>
        <div class="label">Due date</div>
        <div class="value">${esc(job.due_date || '—')}</div>
      </div>
      <div>
        <div class="label">Contact</div>
        <div class="value">${esc(contact)}</div>
      </div>
      <div>
        <div class="label">Job name</div>
        <div class="value">${esc(job.job_name || '—')}</div>
      </div>
    </div>

    ${
      job.scope_notes?.trim()
        ? `<h2>Scope</h2><p class="scope">${esc(job.scope_notes)}</p>`
        : ''
    }
    ${
      job.pinned_brief?.trim()
        ? `<h2>Brief</h2><p class="scope">${esc(job.pinned_brief)}</p>`
        : ''
    }
  </div>

  <div class="sign-block">
    <div class="sign-row">
      <span class="sign-label">Print Name:</span>
      <span class="sign-line"></span>
    </div>
    <div class="sign-row">
      <span class="sign-label">Sign:</span>
      <span class="sign-line"></span>
    </div>
    <div class="sign-row">
      <span class="sign-label">Date:</span>
      <span class="date-line">____ / ____ / 20 ___</span>
    </div>
  </div>

  <script>window.onload = function(){ window.print(); }</script>
</body>
</html>`);
  win.document.close();
}
