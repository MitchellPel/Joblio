import fs from 'node:fs';
import path from 'node:path';
import {
  DEFAULT_AI_SETTINGS,
  getAiDataDir,
  getShareRoot,
  getStoredAiSettings,
  hasExplicitAiProvider,
  type AiProvider,
  type StoredAiSettings,
} from './settingsService';

export type AiSettingsSource = 'this-pc' | 'share-file' | 'off';

export interface AiSettingsPublic {
  provider: AiProvider;
  source: AiSettingsSource;
  ollamaUrl: string;
  ollamaModel: string;
  openaiUrl: string;
  openaiModel: string;
  openaiKeySet: boolean;
}

export interface AiRuntime {
  provider: AiProvider;
  url: string;
  model: string;
  apiKey: string;
  num_thread: number;
  num_ctx: number;
}

function readShareOllamaFile(): { url: string; model: string; num_thread: number; num_ctx: number } | null {
  const root = getShareRoot() || getAiDataDir();
  const file = path.join(root, 'joblio-ollama.json');
  try {
    if (!fs.existsSync(file)) return null;
    const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>;
    const url = String(raw.url || process.env.JOBLIO_OLLAMA_URL || DEFAULT_AI_SETTINGS.ollamaUrl).replace(
      /\/$/,
      ''
    );
    const model = String(raw.model || process.env.JOBLIO_OLLAMA_MODEL || 'auto').trim() || 'auto';
    const num_thread = Math.max(1, Math.min(8, Number(raw.num_thread) || 4));
    const num_ctx = Math.max(512, Math.min(4096, Number(raw.num_ctx) || 2048));
    return { url, model, num_thread, num_ctx };
  } catch {
    return null;
  }
}

export function resolveAiRuntime(): AiRuntime {
  const stored = getStoredAiSettings();
  if (hasExplicitAiProvider()) {
    if (stored.provider === 'openai') {
      return {
        provider: 'openai',
        url: stored.openaiUrl,
        model: stored.openaiModel,
        apiKey: stored.openaiApiKey,
        num_thread: 4,
        num_ctx: 2048,
      };
    }
    if (stored.provider === 'ollama') {
      const share = readShareOllamaFile();
      return {
        provider: 'ollama',
        url: stored.ollamaUrl || share?.url || DEFAULT_AI_SETTINGS.ollamaUrl,
        model: stored.ollamaModel || share?.model || 'auto',
        apiKey: '',
        num_thread: share?.num_thread || 4,
        num_ctx: share?.num_ctx || 2048,
      };
    }
    return {
      provider: 'off',
      url: '',
      model: '',
      apiKey: '',
      num_thread: 4,
      num_ctx: 2048,
    };
  }

  const share = readShareOllamaFile();
  if (share) {
    return {
      provider: 'ollama',
      url: share.url,
      model: share.model,
      apiKey: '',
      num_thread: share.num_thread,
      num_ctx: share.num_ctx,
    };
  }

  const envUrl = (process.env.JOBLIO_OLLAMA_URL || '').trim();
  if (envUrl) {
    return {
      provider: 'ollama',
      url: envUrl.replace(/\/$/, ''),
      model: (process.env.JOBLIO_OLLAMA_MODEL || 'auto').trim() || 'auto',
      apiKey: '',
      num_thread: 4,
      num_ctx: 2048,
    };
  }

  return {
    provider: 'off',
    url: '',
    model: '',
    apiKey: '',
    num_thread: 4,
    num_ctx: 2048,
  };
}

export function getAiSettingsPublic(): AiSettingsPublic {
  const stored = getStoredAiSettings();
  const runtime = resolveAiRuntime();
  const share = readShareOllamaFile();
  let source: AiSettingsSource = 'off';
  if (hasExplicitAiProvider()) source = 'this-pc';
  else if (share) source = 'share-file';

  return {
    provider: runtime.provider,
    source,
    ollamaUrl: hasExplicitAiProvider() ? stored.ollamaUrl : share?.url || DEFAULT_AI_SETTINGS.ollamaUrl,
    ollamaModel: hasExplicitAiProvider() ? stored.ollamaModel : share?.model || 'auto',
    openaiUrl: stored.openaiUrl,
    openaiModel: stored.openaiModel,
    openaiKeySet: !!stored.openaiApiKey,
  };
}
