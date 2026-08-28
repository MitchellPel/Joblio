import { ipcMain, dialog, BrowserWindow, app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { getSettings, setDbPath, getShareRoot, setShareRoot } from '../services/settingsService';
import { initDatabaseAsync, closeDatabase } from '../db/connection';
import { startDbSync } from '../services/dbSync';
import { getGraphicsMode, setGraphicsMode, type GraphicsMode } from '../utils/graphicsMode';
import { getStoredDataBackend, setStoredDataBackend } from '../utils/dataBackendPref';
import {
  getDataBackend,
  isSelfHostMode,
  setRuntimeDataBackend,
  type DataBackend,
} from '../db/backendMode';
import { clearSelfHostEnvCache } from '../selfhost/rest';
import { TITLEBAR_OVERLAY_HEIGHT, titleBarOverlayOptions } from '../utils/windowChrome';

export function registerSettingsIpc(ipcMain: Electron.IpcMain): void {
  ipcMain.handle('settings:getDbPath', async () => {
    if (isSelfHostMode()) {
      return { configured: true, path: '(self-host — Docker Postgres)' };
    }
    return getSettings();
  });

  ipcMain.handle('settings:setDbPath', async (_event, dbPath: string) => {
    if (isSelfHostMode()) {
      return { error: 'Database path is locked in self-host mode. Staff share DB is not used.' };
    }
    if (!dbPath || !dbPath.trim()) {
      return { error: 'Path is required.' };
    }

    try {
      setDbPath(dbPath.trim());
      closeDatabase();
      await initDatabaseAsync();
      startDbSync();
      return { ok: true };
    } catch (err: any) {
      return { error: err.message || 'Failed to initialize database.' };
    }
  });

  ipcMain.handle('settings:pickFolder', async () => {
    const win = BrowserWindow.getFocusedWindow();
    if (!win) return null;

    const result = await dialog.showOpenDialog(win, {
      properties: ['openDirectory'],
      title: 'Select shared folder for job database',
    });

    if (result.canceled || result.filePaths.length === 0) return null;

    const folderPath = result.filePaths[0];
    return folderPath + '\\jobs.db';
  });

  ipcMain.handle('settings:getShareRoot', async () => {
    return { path: getShareRoot() };
  });

  ipcMain.handle('settings:pickShareRoot', async () => {
    const win = BrowserWindow.getFocusedWindow();
    if (!win) return { error: 'No window available.' };

    const result = await dialog.showOpenDialog(win, {
      properties: ['openDirectory'],
      title: 'Select the Joblio share folder (contains joblio-api-key.txt)',
    });
    if (result.canceled || result.filePaths.length === 0) {
      return { cancelled: true };
    }

    const folder = result.filePaths[0];
    const keyFile = path.join(folder, 'joblio-api-key.txt');
    if (!fs.existsSync(keyFile)) {
      return {
        error:
          'That folder does not contain joblio-api-key.txt. Pick the Joblio share folder (e.g. Jobtracker).',
      };
    }

    try {
      setShareRoot(folder);
      clearSelfHostEnvCache();
      return { ok: true, path: folder };
    } catch (err: any) {
      return { error: err?.message || 'Failed to save share path.' };
    }
  });

  ipcMain.handle('settings:setShareRoot', async (_event, shareRoot: string) => {
    if (!shareRoot?.trim()) return { error: 'Path is required.' };
    const folder = shareRoot.trim().replace(/[\\/]+$/, '');
    const keyFile = path.join(folder, 'joblio-api-key.txt');
    if (!fs.existsSync(keyFile)) {
      return {
        error:
          'That folder does not contain joblio-api-key.txt. Pick the Joblio share folder (e.g. Jobtracker).',
      };
    }
    try {
      setShareRoot(folder);
      clearSelfHostEnvCache();
      return { ok: true, path: folder };
    } catch (err: any) {
      return { error: err?.message || 'Failed to save share path.' };
    }
  });

  ipcMain.handle('settings:getGraphicsMode', async () => {
    return { mode: getGraphicsMode() as GraphicsMode };
  });

  ipcMain.handle('settings:setGraphicsMode', async (_event, mode: GraphicsMode) => {
    if (mode !== 'soft' && mode !== 'hard') {
      return { error: 'Invalid graphics mode.' };
    }
    try {
      setGraphicsMode(mode);
      return { ok: true, mode, needsRestart: true };
    } catch (err: any) {
      return { error: err.message || 'Failed to save graphics mode.' };
    }
  });

  ipcMain.handle('settings:getDataBackend', async () => {
    const env = (process.env.JOBLIO_DATA_BACKEND || '').trim().toLowerCase();
    const envLocked = env === 'selfhost' || env === 'docker' || env === 'sqlite';
    return {
      backend: getDataBackend() as DataBackend,
      stored: getStoredDataBackend() as DataBackend,
      envLocked,
      envValue: envLocked ? ((env === 'docker' ? 'selfhost' : env) as DataBackend) : null,
    };
  });

  ipcMain.handle('settings:setDataBackend', async (_event, backend: DataBackend) => {
    if (backend !== 'sqlite' && backend !== 'selfhost') {
      return { error: 'Invalid data mode.' };
    }
    const env = (process.env.JOBLIO_DATA_BACKEND || '').trim().toLowerCase();
    if (env === 'selfhost' || env === 'docker' || env === 'sqlite') {
      return {
        error:
          'Data mode is locked by launch flag (JOBLIO_DATA_BACKEND). Use npm run dev (not dev:selfhost) to change it in Settings.',
      };
    }
    try {
      setStoredDataBackend(backend);
      setRuntimeDataBackend(backend);
      return { ok: true, backend, needsRestart: true };
    } catch (err: any) {
      return { error: err.message || 'Failed to save data mode.' };
    }
  });

  ipcMain.handle('settings:relaunchApp', async () => {
    app.relaunch();
    app.exit(0);
    return { ok: true };
  });

  ipcMain.handle(
    'window:setTitleBarOverlay',
    (event, opts: { color?: string; symbolColor?: string; theme?: 'light' | 'dark'; glass?: boolean }) => {
      const win = BrowserWindow.fromWebContents(event.sender);
      if (!win || typeof win.setTitleBarOverlay !== 'function') return { ok: false };
      const next =
        opts?.theme === 'light' || opts?.theme === 'dark'
          ? titleBarOverlayOptions(opts.theme, !!opts.glass)
          : {
              color: typeof opts?.color === 'string' ? opts.color : '#f2f1ed',
              symbolColor: typeof opts?.symbolColor === 'string' ? opts.symbolColor : '#26251e',
              height: TITLEBAR_OVERLAY_HEIGHT,
            };
      try {
        win.setTitleBarOverlay(next);
        return { ok: true };
      } catch {
        return { ok: false };
      }
    }
  );
}
