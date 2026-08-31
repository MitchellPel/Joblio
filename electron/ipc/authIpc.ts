import type { IpcMain } from 'electron';
import { login, logout, validateSession } from '../services/authService';
import { whenDbReady } from '../db/connection';
import { isSelfHostMode, getDataBackend } from '../db/backendMode';
import { checkMentions } from '../services/mentionNotifier';
import { checkOrders } from '../services/orderNotifier';
import { checkFeedback } from '../services/feedbackNotifier';
import { checkQuoteSizes } from '../services/quoteSizeNotifier';
import { refreshUserCache } from '../selfhost/usersCloud';
import { describeSelfHostFetchError } from '../selfhost/rest';

export function registerAuthIpc(ipcMain: IpcMain): void {
  ipcMain.handle('auth:backendMode', async () => ({
    backend: getDataBackend(),
    selfHost: isSelfHostMode(),
    /** @deprecated use selfHost */
    cloudTest: isSelfHostMode(),
  }));

  ipcMain.handle('auth:login', async (_event, username: string, password: string) => {
    const trimmedUsername = username?.trim();
    if (!trimmedUsername || !password) {
      return { error: 'Username and password are required.' };
    }

    if (isSelfHostMode()) {
      try {
        await refreshUserCache();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (/api key missing/i.test(msg) || /joblio-api-key/i.test(msg)) {
          return { error: msg };
        }
        return { error: describeSelfHostFetchError(err) };
      }
    } else if (!(await whenDbReady())) {
      return { error: 'Still connecting to the shared database. Please try again.' };
    }

    const result = await login(trimmedUsername, password);
    if (!result) {
      return { error: 'Invalid username or password.' };
    }
    setTimeout(checkMentions, 1500);
    setTimeout(checkOrders, 1800);
    setTimeout(checkFeedback, 2100);
    setTimeout(checkQuoteSizes, 2400);
    return result;
  });

  ipcMain.handle('auth:logout', async (_event, token: string) => {
    logout(token);
  });

  ipcMain.handle('auth:currentSession', async (_event, token: string) => {
    if (!token) return null;
    if (!isSelfHostMode() && !(await whenDbReady())) return null;
    const user = await validateSession(token);
    if (!user) return null;
    return { token, user } as const;
  });
}

export async function requireAuth(
  token: string
): Promise<{ userId: number } | { error: string }> {
  const user = await validateSession(token);
  if (!user) return { error: 'Not authenticated or session expired.' };
  return { userId: user.id };
}

export async function requireAdmin(
  token: string
): Promise<{ userId: number } | { error: string }> {
  const user = await validateSession(token);
  if (!user) return { error: 'Not authenticated or session expired.' };
  if (user.role !== 'admin') return { error: 'Admin privileges required.' };
  return { userId: user.id };
}
