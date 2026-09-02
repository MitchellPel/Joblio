import { app, BrowserWindow, dialog, ipcMain, IpcMain, Menu, MenuItem } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { registerAllIpc } from './ipc/index.js';
import { setUpdaterWindow, setupAutoUpdater } from './ipc/updaterIpc.js';
import { setRiggingAlertWindow } from './ipc/riggingIpc.js';
import { initDatabaseAsync, getDbPath, closeDatabase } from './db/connection.js';
import { startDbSync, stopDbSync } from './services/dbSync.js';
import { startRiggingAlerts } from './services/riggingAlerts.js';
import {
  applyGraphicsModeBeforeReady,
  forceSoftGraphicsAfterCrash,
} from './utils/graphicsMode.js';
import { titleBarOverlayOptions, windowBackgroundForTheme } from './utils/windowChrome.js';
import { applyAppIdentity } from './utils/joblioNotify.js';

applyAppIdentity();

let mainWindow: BrowserWindow | null = null;

// Default soft = stable on GPU-less shop laptops. Desktops can switch in Settings.
const graphicsMode = applyGraphicsModeBeforeReady();

function startupLog(message: string): void {
  try {
    const dir = app.getPath('userData');
    fs.mkdirSync(dir, { recursive: true });
    const line = `[${new Date().toISOString()}] ${message}\n`;
    fs.appendFileSync(path.join(dir, 'startup.log'), line);
  } catch {
    // ignore
  }
  console.log(message);
}

function resolveIconPath(): string | undefined {
  const ico = path.join(__dirname, '..', 'build', 'icon.ico');
  const png = path.join(__dirname, '..', 'build', 'icon.png');
  if (fs.existsSync(ico)) return ico;
  if (fs.existsSync(png)) return png;
  return undefined;
}

function showLoadFailurePage(win: BrowserWindow, detail: string): void {
  startupLog(`[window] load failure: ${detail}`);
  const safe = detail.replace(/[<>&]/g, (c) =>
    ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c] || c)
  );
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Joblio</title>
<style>
  :root{color-scheme:light dark}
  body{margin:0;font-family:Segoe UI,system-ui,sans-serif;background:#f2f1ed;color:#26251e;
    display:flex;align-items:center;justify-content:center;height:100vh;padding:24px;box-sizing:border-box}
  .card{max-width:440px;background:#fff;border-radius:16px;padding:28px;
    box-shadow:0 14px 40px rgba(0,0,0,.12)}
  h1{font-size:18px;margin:0 0 8px} p{font-size:14px;color:#6b6560;line-height:1.45;margin:0 0 12px}
  code{display:block;font-size:11px;background:#f4f3ef;padding:10px;border-radius:8px;
    white-space:pre-wrap;word-break:break-word;margin:0 0 16px}
  button{width:100%;border:0;border-radius:10px;padding:10px 14px;background:#26251e;color:#f2f1ed;
    font-size:14px;font-weight:600;cursor:pointer}
  @media (prefers-color-scheme:dark){
    body{background:#1c1b18;color:#ebe9e2}
    .card{background:#2a2924;box-shadow:0 14px 40px rgba(0,0,0,.45)}
    p{color:#a8a49c}
    code{background:#23221e;color:#ebe9e2}
    button{background:#ebe9e2;color:#1c1b18}
  }
</style></head><body><div class="card">
  <h1>Joblio could not open on this PC</h1>
  <p>Reinstall from <b>\\\\server\\Gary\\Job Tracker\\updates</b>.
  Graphics default to <b>compatible</b> mode for shop laptops — change under Settings if needed.</p>
  <code>${safe}</code>
  <button onclick="location.reload()">Retry</button>
</div></body></html>`;
  win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
}

function createWindow(): BrowserWindow {
  const iconPath = resolveIconPath();
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'Joblio',
    backgroundColor: windowBackgroundForTheme('light'),
    show: true,
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    titleBarOverlay: titleBarOverlayOptions('light', false),
    ...(iconPath ? { icon: iconPath } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: true,
    },
  });

  // English spell check + right-click suggestions (Chromium built-in)
  try {
    const ses = win.webContents.session;
    ses.setSpellCheckerEnabled(true);
    const available = ses.availableSpellCheckerLanguages;
    const preferred = ['en-US', 'en-GB', 'en-ZA'].filter((lang) => available.includes(lang));
    ses.setSpellCheckerLanguages(preferred.length > 0 ? preferred : ['en-US']);
  } catch (err) {
    startupLog(`[spellcheck] setup failed: ${err instanceof Error ? err.message : err}`);
  }

  win.webContents.on('context-menu', (_event, params) => {
    const menu = new Menu();
    for (const suggestion of params.dictionarySuggestions) {
      menu.append(
        new MenuItem({
          label: suggestion,
          click: () => win.webContents.replaceMisspelling(suggestion),
        })
      );
    }
    if (params.misspelledWord) {
      if (params.dictionarySuggestions.length > 0) {
        menu.append(new MenuItem({ type: 'separator' }));
      }
      menu.append(
        new MenuItem({
          label: 'Add to dictionary',
          click: () =>
            win.webContents.session.addWordToSpellCheckerDictionary(params.misspelledWord),
        })
      );
    }
    if (params.editFlags.canCut || params.editFlags.canCopy || params.editFlags.canPaste) {
      if (menu.items.length > 0) menu.append(new MenuItem({ type: 'separator' }));
      if (params.editFlags.canCut) {
        menu.append(new MenuItem({ role: 'cut' }));
      }
      if (params.editFlags.canCopy) {
        menu.append(new MenuItem({ role: 'copy' }));
      }
      if (params.editFlags.canPaste) {
        menu.append(new MenuItem({ role: 'paste' }));
      }
    }
    if (menu.items.length > 0) {
      menu.popup();
    }
  });

  startupLog(`[window] created, graphics=${graphicsMode}`);

  win.webContents.on('did-finish-load', () => {
    startupLog('[window] did-finish-load');
  });

  win.webContents.on('did-fail-load', (_e, code, desc, url, isMainFrame) => {
    if (!isMainFrame || code === -3) return;
    showLoadFailurePage(win, `Load failed (${code}): ${desc}\n${url}`);
  });

  win.webContents.on('render-process-gone', (_e, details) => {
    startupLog(`[window] render-process-gone ${details.reason}`);
    forceSoftGraphicsAfterCrash();
    showLoadFailurePage(
      win,
      `Display process crashed (${details.reason}). Exit code ${details.exitCode}.\n` +
        `Switched this PC to compatible graphics — close and reopen Joblio.`
    );
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    win.loadURL(devServerUrl);
  } else {
    const indexHtml = path.join(__dirname, '../dist/index.html');
    startupLog(`[window] loading ${indexHtml} exists=${fs.existsSync(indexHtml)}`);
    if (!fs.existsSync(indexHtml)) {
      showLoadFailurePage(win, `Missing UI file:\n${indexHtml}\n\nReinstall Joblio from the updates share.`);
    } else {
      win.loadFile(indexHtml).catch((err) => {
        showLoadFailurePage(win, String(err));
      });
    }
  }

  return win;
}

async function bootstrap(): Promise<void> {
  const { isSelfHostMode, assertSelfHostTestOnly } = await import('./db/backendMode.js');
  const { rescueEmptyOfficeSqlite } = await import('./utils/officeDbRescue.js');
  try {
    const rescued = await rescueEmptyOfficeSqlite();
    if (rescued) startupLog('[db] empty office sqlite — switched to shop server');
  } catch (err: any) {
    startupLog(`[db] office sqlite rescue skipped: ${err?.message || err}`);
  }
  assertSelfHostTestOnly();

  startupLog(
    `[boot] Joblio ${app.getVersion()} starting (graphics=${graphicsMode}` +
      (isSelfHostMode() ? ', SELF-HOST MODE — share DB untouched' : '') +
      ')'
  );
  registerAllIpc(ipcMain as IpcMain);

  mainWindow = createWindow();

  setUpdaterWindow(mainWindow);
  setRiggingAlertWindow(mainWindow);
  mainWindow.on('closed', () => {
    mainWindow = null;
    setUpdaterWindow(null);
    setRiggingAlertWindow(null);
  });

  // Self-host: talk only to Docker Postgres (LAN or public tunnel). Never open/sync staff SQLite.
  // Auto-updater still runs — updates come from the share like always.
  if (isSelfHostMode()) {
    startupLog('[db] self-host mode — skipping SQLite share init/sync');
    try {
      const { startSelfHostEndpointWatcher } = await import('./selfhost/rest.js');
      startSelfHostEndpointWatcher();
      startupLog('[db] self-host endpoint watcher started');
    } catch (err: any) {
      startupLog(`[db] endpoint watcher failed: ${err?.message || err}`);
    }
    try {
      const { startSelfHostSync } = await import('./services/selfhostSync.js');
      startSelfHostSync();
      startupLog('[db] self-host board sync started');
    } catch (err: any) {
      startupLog(`[db] self-host sync failed: ${err?.message || err}`);
    }
    try {
      startRiggingAlerts();
      startupLog('[db] self-host rigging alerts started');
    } catch (err: any) {
      startupLog(`[db] rigging alerts failed: ${err?.message || err}`);
    }
    setTimeout(() => setupAutoUpdater(), 5000);
    return;
  }

  setImmediate(() => {
    const t0 = Date.now();
    initDatabaseAsync()
      .then(() => {
        startupLog(`[db] ready at ${getDbPath()} (${Date.now() - t0}ms)`);
        startDbSync();
        startRiggingAlerts();

        setTimeout(() => {
          void (async () => {
            try {
              const { migrateProofsToFilesAsync } = await import('./repositories/proofsRepo.js');
              const result = await migrateProofsToFilesAsync();
              if (result.moved > 0) {
                startupLog(
                  `[proofs] moved ${result.moved} image(s) to disk` +
                    (result.vacuumed ? ' (compacted)' : '')
                );
              }
            } catch (err: any) {
              startupLog(`[proofs] migrate-to-files failed: ${err?.message || err}`);
            }
          })();
        }, 1500);

        setTimeout(() => setupAutoUpdater(), 5000);
      })
      .catch((err: any) => {
        startupLog(`[db] not ready: ${err?.message || err}`);
      });
  });
}

app.whenReady().then(() => {
  bootstrap().catch((err) => {
    startupLog(`[boot] failed: ${err?.message || err}`);
    dialog.showErrorBox('Joblio failed to start', String(err?.message || err));
  });
});

process.on('uncaughtException', (err) => {
  startupLog(`[fatal] ${err?.stack || err}`);
  console.error('[fatal] Uncaught exception:', err);
});
process.on('unhandledRejection', (reason) => {
  startupLog(`[fatal-rejection] ${reason}`);
  console.error('[fatal] Unhandled rejection:', reason);
});

app.on('window-all-closed', () => {
  stopDbSync();
  closeDatabase();
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
