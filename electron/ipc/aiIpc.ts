import type { IpcMain } from 'electron';
import { requireAuth, requireAdmin } from './authIpc';
import { isSelfHostMode } from '../db/backendMode';
import { findUserById } from '../repositories/usersRepo';
import {
  aiStatus,
  listPriceFiles,
  addPriceFileFromDialog,
  removePriceFile,
  listSavedNotes,
  runAiChat,
  cancelAiChat,
  type AiChatMessage,
} from '../services/aiAssistant';
import type { StoredAiChat } from '../selfhost/aiChatsCloud';

async function loadUser(userId: number) {
  if (isSelfHostMode()) {
    const { findUserByIdCloudFresh } = await import('../selfhost/usersCloud');
    return (await findUserByIdCloudFresh(userId)) || null;
  }
  return findUserById(userId) || null;
}

function canUseAi(user: {
  role: string;
  can_use_ai?: boolean | number | null;
}): boolean {
  if (user.role === 'admin') return true;
  return user.can_use_ai === true || user.can_use_ai === 1;
}

async function requireAi(token: string) {
  const auth = await requireAuth(token);
  if ('error' in auth) return auth;
  const user = await loadUser(auth.userId);
  if (!user) return { error: 'Not signed in.' };
  if (!canUseAi(user)) return { error: 'Joblio AI is not enabled for this account. Ask an admin.' };
  return { userId: auth.userId, user };
}

function cleanMessages(messages: AiChatMessage[]): AiChatMessage[] {
  if (!Array.isArray(messages)) return [];
  return messages
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .slice(-80)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }));
}

async function persistOwnChat(
  userId: number,
  messages: AiChatMessage[],
  session: unknown,
  threadId?: string
): Promise<void> {
  if (!isSelfHostMode()) return;
  try {
    const { saveAiChatCloud } = await import('../selfhost/aiChatsCloud');
    await saveAiChatCloud(userId, messages, session, threadId);
  } catch (err) {
    const { isAiChatsTableMissing } = await import('../selfhost/aiChatsCloud');
    if (isAiChatsTableMissing(err)) return;
    console.warn('[ai] could not save chat', err);
  }
}

export function registerAiIpc(ipcMain: IpcMain): void {
  ipcMain.handle('ai:permissions', async (_event, token: string) => {
    const auth = await requireAuth(token);
    if ('error' in auth) return { error: auth.error };
    const user = await loadUser(auth.userId);
    if (!user) return { can_use: false };
    return { can_use: canUseAi(user) };
  });

  ipcMain.handle('ai:status', async (_event, token: string) => {
    const gate = await requireAi(token);
    if ('error' in gate) return { error: gate.error };
    return aiStatus();
  });

  ipcMain.handle('ai:listPriceFiles', async (_event, token: string) => {
    const gate = await requireAi(token);
    if ('error' in gate) return { error: gate.error };
    try {
      return listPriceFiles();
    } catch (err: unknown) {
      return { error: err instanceof Error ? err.message : 'Could not list price files.' };
    }
  });

  ipcMain.handle('ai:addPriceFiles', async (_event, token: string) => {
    const gate = await requireAi(token);
    if ('error' in gate) return { error: gate.error };
    return addPriceFileFromDialog();
  });

  ipcMain.handle('ai:removePriceFile', async (_event, token: string, name: string) => {
    const gate = await requireAi(token);
    if ('error' in gate) return { error: gate.error };
    return removePriceFile(String(name || ''));
  });

  ipcMain.handle('ai:listNotes', async (_event, token: string) => {
    const gate = await requireAi(token);
    if ('error' in gate) return { error: gate.error };
    try {
      return listSavedNotes();
    } catch (err: unknown) {
      return { error: err instanceof Error ? err.message : 'Could not read saved notes.' };
    }
  });

  ipcMain.handle('ai:loadChat', async (_event, token: string) => {
    const gate = await requireAi(token);
    if ('error' in gate) return { error: gate.error };
    if (!isSelfHostMode()) return { messages: [], session: null, stored: false, threads: [], activeId: null };
    try {
      const { loadAiInboxCloud } = await import('../selfhost/aiChatsCloud');
      const inbox = await loadAiInboxCloud(gate.userId);
      const active = inbox.threads.find((t) => t.id === inbox.activeId) || inbox.threads[0] || null;
      return {
        stored: true,
        threads: inbox.threads,
        activeId: inbox.activeId,
        messages: active?.messages || [],
        session: active?.session || null,
      };
    } catch (err) {
      const { isAiChatsTableMissing } = await import('../selfhost/aiChatsCloud');
      if (isAiChatsTableMissing(err)) {
        return { messages: [], session: null, stored: false, threads: [], activeId: null };
      }
      return { error: err instanceof Error ? err.message : 'Could not load chat.' };
    }
  });

  ipcMain.handle(
    'ai:saveChat',
    async (
      _event,
      token: string,
      messages: AiChatMessage[],
      session?: unknown,
      threadId?: string
    ) => {
      const gate = await requireAi(token);
      if ('error' in gate) return { error: gate.error };
      await persistOwnChat(gate.userId, cleanMessages(messages), session, threadId);
      return { ok: true };
    }
  );

  ipcMain.handle(
    'ai:saveInbox',
    async (_event, token: string, inbox: { threads: unknown[]; activeId: string | null }) => {
      const gate = await requireAi(token);
      if ('error' in gate) return { error: gate.error };
      if (!isSelfHostMode()) return { ok: true };
      try {
        const { saveAiInboxCloud, parseAiInbox } = await import('../selfhost/aiChatsCloud');
        const parsed = parseAiInbox(JSON.stringify({ v: 2, ...inbox }), '{}');
        await saveAiInboxCloud(gate.userId, parsed);
        return { ok: true };
      } catch (err) {
        const { isAiChatsTableMissing } = await import('../selfhost/aiChatsCloud');
        if (isAiChatsTableMissing(err)) return { ok: true };
        return { error: err instanceof Error ? err.message : 'Could not save chats.' };
      }
    }
  );

  ipcMain.handle('ai:listStaffChats', async (_event, token: string) => {
    const admin = await requireAdmin(token);
    if ('error' in admin) return { error: admin.error };
    if (!isSelfHostMode()) return [];
    try {
      const { listAiChatsCloud } = await import('../selfhost/aiChatsCloud');
      const rows = await listAiChatsCloud();
      return rows.map((r: StoredAiChat) => ({
        userId: r.userId,
        threadId: r.threadId,
        username: r.username,
        fullName: r.fullName,
        title: r.title,
        updatedAt: r.updatedAt,
        preview: r.preview,
      }));
    } catch (err) {
      const { isAiChatsTableMissing } = await import('../selfhost/aiChatsCloud');
      if (isAiChatsTableMissing(err)) return [];
      return { error: err instanceof Error ? err.message : 'Could not list chats.' };
    }
  });

  ipcMain.handle(
    'ai:loadStaffChat',
    async (_event, token: string, userId: number, threadId?: string) => {
      const admin = await requireAdmin(token);
      if ('error' in admin) return { error: admin.error };
      const id = Number(userId);
      if (!Number.isFinite(id) || id < 1) return { error: 'Invalid user.' };
      if (!isSelfHostMode()) return { error: 'Staff chats are stored on the office database.' };
      try {
        const { loadAiInboxCloud } = await import('../selfhost/aiChatsCloud');
        const inbox = await loadAiInboxCloud(id);
        const thread =
          (threadId ? inbox.threads.find((t) => t.id === threadId) : null) || inbox.threads[0];
        const { findUserByIdCloudCached, ensureUserCache } = await import('../selfhost/usersCloud');
        await ensureUserCache();
        const u = findUserByIdCloudCached(id);
        if (!thread) return { messages: [], fullName: u?.full_name || '', username: u?.username || '' };
        return {
          messages: thread.messages,
          fullName: u?.full_name || u?.username || '',
          username: u?.username || '',
          title: thread.title,
        };
      } catch (err) {
        const { isAiChatsTableMissing } = await import('../selfhost/aiChatsCloud');
        if (isAiChatsTableMissing(err)) return { error: 'AI chat table is not on the server yet.' };
        return { error: err instanceof Error ? err.message : 'Could not load staff chat.' };
      }
    }
  );

  ipcMain.handle(
    'ai:chat',
    async (
      _event,
      token: string,
      messages: AiChatMessage[],
      session?: unknown,
      threadId?: string
    ) => {
      const gate = await requireAi(token);
      if ('error' in gate) return { error: gate.error };
      const incoming = cleanMessages(messages);
      if (!incoming.length) {
        return { error: 'Ask a question first.' };
      }
      const forModel = incoming.slice(-12);
      try {
        const result = await runAiChat(forModel, session);
        if (!('error' in result) && !result.cancelled) {
          const stored = [...incoming, { role: 'assistant' as const, content: result.reply }];
          await persistOwnChat(gate.userId, stored, result.session, threadId);
        }
        return result;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return { error: msg.includes('abort') ? 'Stopped.' : msg };
      }
    }
  );

  ipcMain.handle('ai:cancel', async (_event, token: string) => {
    const gate = await requireAi(token);
    if ('error' in gate) return { error: gate.error };
    cancelAiChat();
    return { ok: true };
  });
}
