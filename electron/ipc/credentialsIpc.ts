import type { IpcMain } from 'electron';
import { app, safeStorage } from 'electron';
import * as fs from 'node:fs';
import * as path from 'node:path';

function getCredentialsPath(): string {
  return path.join(app.getPath('userData'), 'saved-credentials.json');
}

export function registerCredentialsIpc(ipcMain: IpcMain): void {
  ipcMain.handle('auth:saveCredentials', async (_event, data: { username: string; password: string }) => {
    try {
      if (!safeStorage.isEncryptionAvailable()) {
        return { error: 'Encryption not available on this system.' };
      }

      const payload = JSON.stringify(data);
      const encrypted = safeStorage.encryptString(payload);
      const base64 = encrypted.toString('base64');
      const filePath = getCredentialsPath();

      fs.writeFileSync(filePath, JSON.stringify({ encrypted: base64 }), 'utf-8');
      return { ok: true };
    } catch (err: any) {
      return { error: err.message || 'Failed to save credentials.' };
    }
  });

  ipcMain.handle('auth:loadCredentials', async () => {
    try {
      if (!safeStorage.isEncryptionAvailable()) {
        return null;
      }

      const filePath = getCredentialsPath();
      if (!fs.existsSync(filePath)) return null;

      const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      const encrypted = Buffer.from(raw.encrypted, 'base64');
      const decrypted = safeStorage.decryptString(encrypted);
      return JSON.parse(decrypted) as { username: string; password: string };
    } catch {
      // If anything fails (corrupted file, wrong key, etc.), clear it
      try { fs.unlinkSync(getCredentialsPath()); } catch {}
      return null;
    }
  });

  ipcMain.handle('auth:clearCredentials', async () => {
    try {
      const filePath = getCredentialsPath();
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      return { ok: true };
    } catch (err: any) {
      return { error: err.message || 'Failed to clear credentials.' };
    }
  });
}
