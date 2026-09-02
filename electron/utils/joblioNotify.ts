import { Notification, app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

export const JOBLIO_AUMID = 'com.signageco.jobtracker';

/** Must run before app.whenReady() so Windows toasts say Joblio, not Electron. */
export function applyAppIdentity(): void {
  app.setName('Joblio');
  if (process.platform === 'win32') {
    app.setAppUserModelId(JOBLIO_AUMID);
  }
}

export function joblioNotifyIcon(): string | undefined {
  const candidates = [
    path.join(__dirname, '..', 'build', 'icon.ico'),
    path.join(__dirname, '..', '..', 'build', 'icon.ico'),
    path.join(process.resourcesPath || '', 'icon.ico'),
    path.join(process.resourcesPath || '', 'build', 'icon.ico'),
  ];
  for (const p of candidates) {
    if (p && fs.existsSync(p)) return p;
  }
  return undefined;
}

export function showJoblioNotification(opts: {
  title: string;
  body: string;
  silent?: boolean;
  onClick?: () => void;
}): void {
  if (!Notification.isSupported()) return;
  const icon = joblioNotifyIcon();
  const n = new Notification({
    title: opts.title,
    body: opts.body,
    silent: opts.silent ?? false,
    ...(icon ? { icon } : {}),
  });
  if (opts.onClick) n.on('click', opts.onClick);
  n.show();
}
