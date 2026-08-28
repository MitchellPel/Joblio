import type { IpcMain, BrowserWindow } from 'electron';
import { app } from 'electron';
import * as fs from 'node:fs';
import * as pathModule from 'node:path';
import { autoUpdater, NsisUpdater } from 'electron-updater';
import type { ProgressInfo, UpdateInfo } from 'builder-util-runtime';
import { fileUrlToWindowsPath, FsShareHttpExecutor } from './fsShareHttpExecutor.js';
import { ShareUpdateProvider } from './shareUpdateProvider.js';

/** Hardcoded network share for updates (also read from app-update.yml when present). */
const DEFAULT_UPDATE_DIR = '\\\\server\\D\\Joblio DB\\Jobtracker\\updates';

let mainWindow: BrowserWindow | null = null;
let shareExecutor: FsShareHttpExecutor | null = null;
let configured = false;

export function setUpdaterWindow(win: BrowserWindow | null) {
  mainWindow = win;
}

function getUpdateConfigDir(): string {
  if (process.env.VITE_DEV_SERVER_URL) return '';
  return process.resourcesPath || pathModule.join(app.getAppPath(), '..');
}

function toWindowsPath(fileUrlOrPath: string): string {
  const raw = fileUrlOrPath.trim();
  if (raw.startsWith('\\\\')) return raw.replace(/[\\/]+$/, '');
  if (raw.startsWith('//')) return raw.replace(/\//g, '\\').replace(/[\\/]+$/, '');
  if (raw.toLowerCase().startsWith('file:')) {
    try {
      return fileUrlToWindowsPath(new URL(raw)).replace(/[\\/]+$/, '');
    } catch {
      /* fall through */
    }
  }
  return raw.replace(/[\\/]+$/, '');
}

function resolveUpdateDir(): string {
  try {
    const configPath = pathModule.join(getUpdateConfigDir(), 'app-update.yml');
    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, 'utf-8');
      const urlMatch = raw.match(/^url:\s*(.+)$/m);
      if (urlMatch) return toWindowsPath(urlMatch[1].trim());
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log('[updater] Could not read app-update.yml:', msg);
  }
  return DEFAULT_UPDATE_DIR;
}

function send(channel: string, payload?: unknown) {
  mainWindow?.webContents.send(channel, payload);
}

function configureAutoUpdater(): void {
  if (configured || process.env.VITE_DEV_SERVER_URL) return;

  const shareDir = resolveUpdateDir();
  shareExecutor = new FsShareHttpExecutor();

  const runtimeOptions = {
    platform: 'win32' as const,
    isUseMultipleRangeRequest: false,
    executor: shareExecutor,
  };

  const provider = new ShareUpdateProvider(shareDir, runtimeOptions);

  autoUpdater.logger = console;
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.disableDifferentialDownload = true;
  autoUpdater.disableWebInstaller = true;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updater = autoUpdater as any;
  updater.httpExecutor = shareExecutor;
  updater.clientPromise = Promise.resolve(provider);
  if (autoUpdater instanceof NsisUpdater) {
    autoUpdater.installDirectory = pathModule.dirname(process.execPath);
  }

  autoUpdater.on('checking-for-update', () => {
    console.log('[updater] Checking for update…');
    send('updater:checking');
  });

  autoUpdater.on('update-available', (info: UpdateInfo) => {
    console.log('[updater] Update available:', info.version);
    send('updater:update-available', { version: info.version, releaseDate: info.releaseDate });
  });

  autoUpdater.on('update-not-available', (info: UpdateInfo) => {
    console.log('[updater] Up to date:', info.version);
    send('updater:up-to-date', { version: info.version });
  });

  autoUpdater.on('download-progress', (progress: ProgressInfo) => {
    send('updater:download-progress', {
      percent: Math.round(progress.percent),
      bytesPerSecond: progress.bytesPerSecond,
      transferred: progress.transferred,
      total: progress.total,
    });
  });

  autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
    console.log('[updater] Update downloaded:', info.version);
    send('updater:update-downloaded', { version: info.version, releaseDate: info.releaseDate });
  });

  autoUpdater.on('error', (err: Error) => {
    const message = err?.message || 'Update error';
    console.log('[updater] Error:', message);
    send('updater:error', message);
  });

  configured = true;
  console.log('[updater] Configured share provider:', shareDir);
}

export function registerUpdaterIpc(ipcMain: IpcMain): void {
  ipcMain.handle('app:getVersion', async () => app.getVersion());

  ipcMain.handle('updater:checkNow', async () => {
    try {
      configureAutoUpdater();
      const currentVersion = app.getVersion();
      const result = await autoUpdater.checkForUpdates();
      if (!result) {
        return { ok: true, current: currentVersion, latest: currentVersion };
      }
      const latest = result.updateInfo.version;
      if (result.isUpdateAvailable) {
        return { ok: true, current: currentVersion, latest };
      }
      return { ok: true, current: currentVersion, latest: currentVersion };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Update check failed.';
      send('updater:error', message);
      return { error: message };
    }
  });

  ipcMain.handle('updater:downloadUpdate', async () => {
    try {
      configureAutoUpdater();
      await autoUpdater.downloadUpdate();
      return { ok: true };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Download failed';
      send('updater:error', message);
      return { error: message };
    }
  });

  ipcMain.handle('updater:installNow', async () => {
    try {
      configureAutoUpdater();
      // Silent install + relaunch app (no NSIS wizard)
      autoUpdater.quitAndInstall(true, true);
      return { ok: true };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to install update';
      return { error: message };
    }
  });
}

export function setupAutoUpdater(): void {
  if (process.env.VITE_DEV_SERVER_URL) return;

  configureAutoUpdater();

  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((err) => {
      console.log('[updater] Auto-check failed:', err?.message || err);
    });
  }, 3000);

  setInterval(() => {
    autoUpdater.checkForUpdates().catch(() => {});
  }, 30 * 60 * 1000);
}
