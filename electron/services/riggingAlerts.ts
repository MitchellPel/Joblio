import { Notification } from 'electron';
import { getActiveUserIds } from './authService';
import { scheduleSave } from '../db/connection';
import { isSelfHostMode } from '../db/backendMode';
import {
  getUpcomingInstalls,
  alertTypeForDays,
  wasAlertSent,
  recordAlertSent,
  alertMessage,
  formatLocalDate,
  type RiggingAlertType,
  type UpcomingInstall,
} from '../repositories/riggingRepo';
import {
  getUpcomingInstallsCloud,
  wasAlertSentCloud,
  recordAlertSentCloud,
} from '../selfhost/riggingCloud';
import { emitRiggingAlert, raiseAlertWindow } from '../ipc/riggingIpc';

const ALERT_HOUR = 8;
const ALERT_MINUTE = 30;

let lastCheckKey = '';
let started = false;

function todayCheckKey(): string {
  return formatLocalDate(new Date());
}

function isPastAlertTime(now: Date): boolean {
  if (now.getHours() > ALERT_HOUR) return true;
  if (now.getHours() === ALERT_HOUR && now.getMinutes() >= ALERT_MINUTE) return true;
  return false;
}

function isInAlertWindow(now: Date): boolean {
  return now.getHours() === ALERT_HOUR && now.getMinutes() === ALERT_MINUTE;
}

function showNativeNotification(title: string, body: string): void {
  if (!Notification.isSupported()) return;
  const n = new Notification({ title, body, silent: false });
  n.on('click', () => raiseAlertWindow());
  n.show();
}

async function processAlertsForUser(
  userId: number,
  alertDate: string,
  includeMissed: boolean
): Promise<number> {
  const installs: UpcomingInstall[] = isSelfHostMode()
    ? await getUpcomingInstallsCloud()
    : getUpcomingInstalls();
  let sent = 0;

  for (const install of installs) {
    const alertType = alertTypeForDays(install.days_until);
    if (!alertType) continue;

    const already = isSelfHostMode()
      ? await wasAlertSentCloud(userId, install.install_id, alertType, alertDate)
      : wasAlertSent(userId, install.install_id, alertType, alertDate);
    if (already) continue;

    const now = new Date();
    if (!includeMissed && !isInAlertWindow(now)) continue;
    if (includeMissed && !isPastAlertTime(now)) continue;

    if (isSelfHostMode()) {
      await recordAlertSentCloud(userId, install.install_id, alertType, alertDate);
    } else {
      recordAlertSent(userId, install.install_id, alertType, alertDate);
    }
    sent++;
    const message = alertMessage(alertType as RiggingAlertType, install);

    showNativeNotification('Joblio — Rigging Schedule', message);
    emitRiggingAlert({
      alert_type: alertType,
      message,
      install_id: install.install_id,
      scheduled_date: install.scheduled_date,
      job_no: install.job_no,
    });
  }

  return sent;
}

async function runAlertCheck(includeMissed = false): Promise<void> {
  try {
    const userIds = getActiveUserIds();
    if (userIds.length === 0) return;

    const alertDate = todayCheckKey();
    let sent = 0;
    for (const userId of userIds) {
      sent += await processAlertsForUser(userId, alertDate, includeMissed);
    }
    if (sent > 0 && !isSelfHostMode()) scheduleSave();
  } catch (err) {
    console.warn('[rigging-alerts] Check failed:', err);
  }
}

export function startRiggingAlerts(): void {
  if (started) return;
  started = true;

  // Catch alerts missed while app was closed (same day, after 8:30)
  setTimeout(() => {
    void runAlertCheck(true);
  }, 5000);

  setInterval(() => {
    const now = new Date();
    const key = `${todayCheckKey()}-${now.getHours()}-${now.getMinutes()}`;

    if (isInAlertWindow(now) && key !== lastCheckKey) {
      lastCheckKey = key;
      void runAlertCheck(false);
    }

    if (now.getHours() === 0 && now.getMinutes() === 0) {
      lastCheckKey = '';
    }
  }, 30_000);
}
