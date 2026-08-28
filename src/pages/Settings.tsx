import { useState, useEffect } from 'react';
import { FolderOpen, Save, HardDrive, RefreshCw, Download, RotateCcw, Sun, Moon, Palette, Sparkles, Monitor, Cloud, Bot } from 'lucide-react';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import WhatsNew from '../components/WhatsNew';
import FeedbackPanel from '../components/FeedbackPanel';
import BoardColorPicker from '../components/BoardColorPicker';

export default function Settings() {
  const { theme, setTheme, glass, setGlass } = useTheme();
  const { token, user, refreshSession, isAdmin } = useAuth();
  const [boardColor, setBoardColor] = useState<string | null>(user?.board_color ?? null);
  const [boardColorError, setBoardColorError] = useState('');
  const [boardColorSaving, setBoardColorSaving] = useState(false);
  const [dbPath, setDbPath] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showWhatsNew, setShowWhatsNew] = useState(false);
  const [graphicsMode, setGraphicsModeState] = useState<'soft' | 'hard'>('soft');
  const [graphicsNeedsRestart, setGraphicsNeedsRestart] = useState(false);
  const [dataBackend, setDataBackendState] = useState<'sqlite' | 'selfhost'>('sqlite');
  const [dataBackendLocked, setDataBackendLocked] = useState(false);
  const [dataBackendNeedsRestart, setDataBackendNeedsRestart] = useState(false);
  const [aiProvider, setAiProvider] = useState<'off' | 'ollama' | 'openai'>('off');
  const [aiSource, setAiSource] = useState<'this-pc' | 'share-file' | 'off'>('off');
  const [aiOllamaUrl, setAiOllamaUrl] = useState('http://127.0.0.1:11434');
  const [aiOllamaModel, setAiOllamaModel] = useState('auto');
  const [aiOpenaiUrl, setAiOpenaiUrl] = useState('https://api.openai.com/v1');
  const [aiOpenaiModel, setAiOpenaiModel] = useState('gpt-4o-mini');
  const [aiOpenaiKey, setAiOpenaiKey] = useState('');
  const [aiKeySet, setAiKeySet] = useState(false);
  const [aiSaving, setAiSaving] = useState(false);

  const [checking, setChecking] = useState(false);
  const [updateStatus, setUpdateStatus] = useState<{
    type: 'checking' | 'available' | 'uptodate' | 'downloading' | 'downloaded' | 'error';
    text: string;
    version?: string;
  } | null>(null);

  useEffect(() => {
    loadSettings();
  }, []);

  useEffect(() => {
    setBoardColor(user?.board_color ?? null);
  }, [user?.board_color]);

  useEffect(() => {
    const unsubAvailable = window.tracker.onUpdateAvailable((info) => {
      setUpdateStatus({ type: 'available', text: `Version ${info.version} is available`, version: info.version });
      setChecking(false);
    });
    const unsubUpToDate = window.tracker.onUpToDate(() => {
      setUpdateStatus({ type: 'uptodate', text: "You're up to date!" });
      setChecking(false);
    });
    const unsubProgress = window.tracker.onDownloadProgress((p) => {
      setUpdateStatus({ type: 'downloading', text: `Downloading… ${p.percent}%` });
    });
    const unsubDownloaded = window.tracker.onUpdateDownloaded((info) => {
      setUpdateStatus({ type: 'downloaded', text: `Version ${info.version} ready to install`, version: info.version });
    });
    const unsubError = window.tracker.onUpdateError((msg) => {
      setUpdateStatus({ type: 'error', text: msg });
      setChecking(false);
    });

    return () => {
      unsubAvailable();
      unsubUpToDate();
      unsubProgress();
      unsubDownloaded();
      unsubError();
    };
  }, []);

  async function loadSettings() {
    try {
      setLoading(true);
      const res = await window.tracker.getDbPath();
      setDbPath(res.path || '');
      const gfx = await window.tracker.getGraphicsMode().catch(() => ({ mode: 'soft' as const }));
      setGraphicsModeState(gfx.mode);
      const backend = await window.tracker.getDataBackend().catch(() => ({
        backend: 'sqlite' as const,
        stored: 'sqlite' as const,
        envLocked: false,
        envValue: null,
      }));
      setDataBackendState(backend.backend);
      setDataBackendLocked(!!backend.envLocked);
      if (token && user?.role === 'admin' && typeof window.tracker.getAiSettings === 'function') {
        const ai = await window.tracker.getAiSettings(token);
        if (!('error' in ai)) {
          setAiProvider(ai.provider);
          setAiSource(ai.source);
          setAiOllamaUrl(ai.ollamaUrl);
          setAiOllamaModel(ai.ollamaModel);
          setAiOpenaiUrl(ai.openaiUrl);
          setAiOpenaiModel(ai.openaiModel);
          setAiKeySet(ai.openaiKeySet);
        }
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to load settings' });
    } finally {
      setLoading(false);
    }
  }

  async function handlePickFolder() {
    const p = await window.tracker.pickFolder();
    if (p) setDbPath(p);
  }

  async function handleUseThisPc() {
    if (dataBackend === 'selfhost') {
      setMessage({ type: 'error', text: 'Database path is not used in Self-host mode.' });
      return;
    }
    setSaving(true);
    setMessage(null);
    const result = await window.tracker.useLocalDb();
    if ('error' in result) {
      setMessage({ type: 'error', text: result.error });
    } else {
      setDbPath(result.path);
      setMessage({ type: 'success', text: 'Jobs will stay on this PC.' });
    }
    setSaving(false);
  }

  async function handleSave() {
    if (dataBackend === 'selfhost') {
      setMessage({ type: 'error', text: 'Database path is not used in Self-host mode.' });
      return;
    }
    if (!dbPath.trim()) {
      setMessage({ type: 'error', text: 'Database path is required.' });
      return;
    }
    setSaving(true);
    setMessage(null);
    const result = await window.tracker.setDbPath(dbPath.trim());
    if ('error' in result) {
      setMessage({ type: 'error', text: result.error });
    } else {
      setMessage({ type: 'success', text: 'Database path updated successfully.' });
    }
    setSaving(false);
  }

  async function handleBoardColor(next: string | null) {
    if (!token) return;
    setBoardColor(next);
    setBoardColorError('');
    setMessage(null);
    if (typeof window.tracker.setBoardColor !== 'function') {
      setBoardColorError('Restart Joblio once so it can save colours, then pick again.');
      return;
    }
    setBoardColorSaving(true);
    try {
      const result = await window.tracker.setBoardColor(token, next);
      if ('error' in result) {
        setBoardColorError(result.error);
        return;
      }
      await refreshSession();
    } catch (err: any) {
      setBoardColorError(err?.message || 'Could not save colour.');
    } finally {
      setBoardColorSaving(false);
    }
  }

  async function handleGraphicsMode(mode: 'soft' | 'hard') {
    const result = await window.tracker.setGraphicsMode(mode);
    if ('error' in result) {
      setMessage({ type: 'error', text: result.error });
      return;
    }
    setGraphicsModeState(result.mode);
    setGraphicsNeedsRestart(!!result.needsRestart);
    setMessage({
      type: 'success',
      text:
        mode === 'soft'
          ? 'Compatible graphics saved — best for laptops. Restart Joblio to apply.'
          : 'Performance graphics saved — restart Joblio to apply.',
    });
  }

  async function handleDataBackend(backend: 'sqlite' | 'selfhost') {
    const result = await window.tracker.setDataBackend(backend);
    if ('error' in result) {
      setMessage({ type: 'error', text: result.error });
      return;
    }
    setDataBackendState(result.backend);
    setDataBackendNeedsRestart(!!result.needsRestart);
    setMessage({
      type: 'success',
      text:
        backend === 'selfhost'
          ? 'Self-host (Docker) selected — restart Joblio to apply. Staff share stays untouched until others switch too.'
          : 'Office share (SQLite) selected — restart Joblio to apply.',
    });
  }

  async function handleSaveAi() {
    if (!token) return;
    setAiSaving(true);
    setMessage(null);
    const result = await window.tracker.setAiSettings(token, {
      provider: aiProvider,
      ollamaUrl: aiOllamaUrl,
      ollamaModel: aiOllamaModel,
      openaiUrl: aiOpenaiUrl,
      openaiModel: aiOpenaiModel,
      openaiApiKey: aiOpenaiKey.trim() || undefined,
    });
    setAiSaving(false);
    if ('error' in result) {
      setMessage({ type: 'error', text: result.error });
      return;
    }
    setAiProvider(result.provider);
    setAiSource(result.source);
    setAiOllamaUrl(result.ollamaUrl);
    setAiOllamaModel(result.ollamaModel);
    setAiOpenaiUrl(result.openaiUrl);
    setAiOpenaiModel(result.openaiModel);
    setAiKeySet(result.openaiKeySet);
    setAiOpenaiKey('');
    setMessage({ type: 'success', text: 'Joblio AI settings saved on this PC.' });
  }

  async function handleCheckForUpdates() {
    setChecking(true);
    setUpdateStatus({ type: 'checking', text: 'Checking for updates…' });
    const result = await window.tracker.checkForUpdatesNow();
    if ('error' in result) {
      setUpdateStatus({ type: 'error', text: result.error });
      setChecking(false);
    }
  }

  async function handleDownloadUpdate() {
    setUpdateStatus({ type: 'downloading', text: 'Downloading…' });
    const result = await window.tracker.downloadUpdate();
    if ('error' in result) {
      setUpdateStatus({ type: 'error', text: result.error });
    }
  }

  async function handleInstallUpdate() {
    await window.tracker.installNow();
  }

  return (
    <div className="jt-page flex flex-col overflow-hidden p-6">
      <div className="jt-scroll mx-auto min-h-0 w-full max-w-2xl flex-1 overflow-y-auto">
        <p className="jt-eyebrow mb-1">Workspace</p>
        <h1 className="jt-section-title mb-6">Settings</h1>

        {loading ? (
          <p className="text-ink-40">Loading settings…</p>
        ) : (
          <div className="space-y-6">
            <FeedbackPanel />

            <div className="jt-card p-6">
              <div className="mb-4 flex items-center gap-2">
                <Cloud className="h-5 w-5 text-ink-55" />
                <h2 className="text-base font-medium text-ink">Data mode</h2>
              </div>
              <p className="mb-4 text-sm leading-relaxed text-ink-55">
                This PC uses SQLite (local or a shared folder). Self-host talks to Docker Postgres:
                LAN in the office, an optional tunnel (ngrok or similar) when staff log in from
                outside. Put those URLs in <span className="font-mono">.env.selfhost</span> — they
                are not baked into the app. Restart after switching.
              </p>
              <div className="inline-flex rounded-lg border border-ink-10 bg-surface-soft p-1">
                <button
                  type="button"
                  disabled={dataBackendLocked}
                  onClick={() => handleDataBackend('sqlite')}
                  className={`inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-all disabled:opacity-40 ${
                    dataBackend === 'sqlite'
                      ? 'bg-card text-ink shadow-ring'
                      : 'text-ink-55 hover:text-ink'
                  }`}
                >
                  Office share
                </button>
                <button
                  type="button"
                  disabled={dataBackendLocked}
                  onClick={() => handleDataBackend('selfhost')}
                  className={`inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-all disabled:opacity-40 ${
                    dataBackend === 'selfhost'
                      ? 'bg-card text-ink shadow-ring'
                      : 'text-ink-55 hover:text-ink'
                  }`}
                >
                  Self-host
                </button>
              </div>
              {dataBackendLocked && (
                <p className="mt-3 text-xs text-ink-40">
                  Locked by launch flag — start with <span className="font-mono">npm run dev</span> to
                  change this in Settings.
                </p>
              )}
              {dataBackendNeedsRestart && !dataBackendLocked && (
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <p className="text-sm text-ink-55">Restart required for this change.</p>
                  <button
                    type="button"
                    className="jt-btn-ghost"
                    onClick={() => window.tracker.relaunchApp()}
                  >
                    <RotateCcw className="h-4 w-4" />
                    Restart now
                  </button>
                </div>
              )}
            </div>

            {isAdmin && (
              <div className="jt-card p-6">
                <div className="mb-4 flex items-center gap-2">
                  <Bot className="h-5 w-5 text-ink-55" />
                  <h2 className="text-base font-medium text-ink">Joblio AI</h2>
                </div>
                <p className="mb-4 text-sm leading-relaxed text-ink-55">
                  Early feature. Pick a model that runs on this PC (Ollama) or a cloud API
                  (OpenAI-compatible). The API key stays on this computer. Shop Ollama on a share
                  file still works until you save a choice here.
                </p>
                {aiSource === 'share-file' && aiProvider === 'ollama' && (
                  <p className="mb-3 text-xs text-ink-40">
                    Using the office <span className="font-mono">joblio-ollama.json</span> file until
                    you save settings on this PC.
                  </p>
                )}
                <div className="mb-4 inline-flex flex-wrap rounded-lg border border-ink-10 bg-surface-soft p-1">
                  {(
                    [
                      ['off', 'Off'],
                      ['ollama', 'Local (Ollama)'],
                      ['openai', 'Cloud'],
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setAiProvider(id)}
                      className={`inline-flex items-center rounded-md px-3 py-2 text-sm font-medium transition-all ${
                        aiProvider === id ? 'bg-card text-ink shadow-ring' : 'text-ink-55 hover:text-ink'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {aiProvider === 'ollama' && (
                  <div className="space-y-3">
                    <div>
                      <label className="jt-label">Ollama URL</label>
                      <input
                        type="text"
                        value={aiOllamaUrl}
                        onChange={(e) => setAiOllamaUrl(e.target.value)}
                        className="jt-input font-mono text-[13px]"
                        placeholder="http://127.0.0.1:11434"
                      />
                    </div>
                    <div>
                      <label className="jt-label">Model</label>
                      <input
                        type="text"
                        value={aiOllamaModel}
                        onChange={(e) => setAiOllamaModel(e.target.value)}
                        className="jt-input font-mono text-[13px]"
                        placeholder="auto"
                      />
                      <p className="mt-1 text-xs text-ink-40">Use auto to pick the first installed model.</p>
                    </div>
                  </div>
                )}
                {aiProvider === 'openai' && (
                  <div className="space-y-3">
                    <div>
                      <label className="jt-label">API base URL</label>
                      <input
                        type="text"
                        value={aiOpenaiUrl}
                        onChange={(e) => setAiOpenaiUrl(e.target.value)}
                        className="jt-input font-mono text-[13px]"
                        placeholder="https://api.openai.com/v1"
                      />
                      <p className="mt-1 text-xs text-ink-40">
                        OpenAI, Groq, Together, or any host with /chat/completions.
                      </p>
                    </div>
                    <div>
                      <label className="jt-label">Model</label>
                      <input
                        type="text"
                        value={aiOpenaiModel}
                        onChange={(e) => setAiOpenaiModel(e.target.value)}
                        className="jt-input font-mono text-[13px]"
                        placeholder="gpt-4o-mini"
                      />
                    </div>
                    <div>
                      <label className="jt-label">API key</label>
                      <input
                        type="password"
                        value={aiOpenaiKey}
                        onChange={(e) => setAiOpenaiKey(e.target.value)}
                        className="jt-input font-mono text-[13px]"
                        placeholder={aiKeySet ? 'Saved on this PC — type to replace' : 'sk-…'}
                        autoComplete="off"
                      />
                    </div>
                  </div>
                )}
                <button
                  type="button"
                  onClick={handleSaveAi}
                  disabled={aiSaving}
                  className="jt-btn-primary mt-4 disabled:opacity-40"
                >
                  <Save className="h-4 w-4" />
                  {aiSaving ? 'Saving…' : 'Save AI settings'}
                </button>
              </div>
            )}

            <div className="jt-card p-6">
              <div className="mb-4 flex items-center gap-2">
                <HardDrive className="h-5 w-5 text-ink-55" />
                <h2 className="text-base font-medium text-ink">Database Location</h2>
              </div>
              <p className="mb-4 text-sm leading-relaxed text-ink-55">
                {dataBackend === 'selfhost'
                  ? 'Not used in Self-host mode — data comes from Docker Postgres.'
                  : 'This PC only, or a shared folder so every shop computer uses the same jobs.db.'}
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={dbPath}
                  onChange={(e) => setDbPath(e.target.value)}
                  placeholder="\\SERVER\SharedFolder\jobs.db"
                  disabled={dataBackend === 'selfhost'}
                  className="jt-input font-mono text-[13px] disabled:opacity-50"
                />
                <button
                  onClick={handlePickFolder}
                  disabled={dataBackend === 'selfhost'}
                  className="jt-btn-ghost shrink-0 disabled:opacity-40"
                >
                  <FolderOpen className="h-4 w-4" />
                  Browse
                </button>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleUseThisPc}
                  disabled={dataBackend === 'selfhost' || saving}
                  className="jt-btn-ghost disabled:opacity-40"
                >
                  <Monitor className="h-4 w-4" />
                  Use this PC only
                </button>
              </div>
              <p className="mt-2 text-xs text-ink-40">
                The database file will be created here if it doesn&apos;t exist.
              </p>
            </div>

            <div className="jt-card p-6">
              <div className="mb-4 flex items-center gap-2">
                <Monitor className="h-5 w-5 text-ink-55" />
                <h2 className="text-base font-medium text-ink">Display (laptops &amp; desktops)</h2>
              </div>
              <p className="mb-4 text-sm leading-relaxed text-ink-55">
                Compatible mode is the default — stable on shop laptops without a strong graphics
                card. Use Performance only on desktops that feel sluggish.
              </p>
              <div className="inline-flex rounded-lg border border-ink-10 bg-surface-soft p-1">
                <button
                  type="button"
                  onClick={() => handleGraphicsMode('soft')}
                  className={`inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-all ${
                    graphicsMode === 'soft'
                      ? 'bg-card text-ink shadow-ring'
                      : 'text-ink-55 hover:text-ink'
                  }`}
                >
                  Compatible
                </button>
                <button
                  type="button"
                  onClick={() => handleGraphicsMode('hard')}
                  className={`inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-all ${
                    graphicsMode === 'hard'
                      ? 'bg-card text-ink shadow-ring'
                      : 'text-ink-55 hover:text-ink'
                  }`}
                >
                  Performance
                </button>
              </div>
              {graphicsNeedsRestart && (
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <p className="text-sm text-ink-55">Restart required for this change.</p>
                  <button
                    type="button"
                    className="jt-btn-ghost"
                    onClick={() => window.tracker.relaunchApp()}
                  >
                    <RotateCcw className="h-4 w-4" />
                    Restart now
                  </button>
                </div>
              )}
            </div>

            <div className="jt-card p-6">
              <div className="mb-4 flex items-center gap-2">
                <Palette className="h-5 w-5 text-ink-55" />
                <h2 className="text-base font-medium text-ink">Appearance</h2>
              </div>
              <p className="mb-4 text-sm leading-relaxed text-ink-55">
                Choose light or dark mode. Your preference is saved on this PC.
              </p>
              <div className="inline-flex rounded-lg border border-ink-10 bg-surface-soft p-1">
                <button
                  type="button"
                  onClick={() => setTheme('light')}
                  className={`inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-all ${
                    theme === 'light'
                      ? 'bg-card text-ink shadow-ring'
                      : 'text-ink-55 hover:text-ink'
                  }`}
                >
                  <Sun className="h-4 w-4" />
                  Light
                </button>
                <button
                  type="button"
                  onClick={() => setTheme('dark')}
                  className={`inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-all ${
                    theme === 'dark'
                      ? 'bg-card text-ink shadow-ring'
                      : 'text-ink-55 hover:text-ink'
                  }`}
                >
                  <Moon className="h-4 w-4" />
                  Dark
                </button>
              </div>
              <p className="mb-3 mt-6 text-sm leading-relaxed text-ink-55">
                Glass adds a warm colour wash and light edges on cards. No extra GPU blur, so shop
                laptops stay snappy. Standard is the usual look. This PC remembers your choice.
              </p>
              <div className="inline-flex rounded-lg border border-ink-10 bg-surface-soft p-1">
                <button
                  type="button"
                  onClick={() => setGlass(false)}
                  className={`inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-all ${
                    !glass ? 'bg-card text-ink shadow-ring' : 'text-ink-55 hover:text-ink'
                  }`}
                >
                  Standard
                </button>
                <button
                  type="button"
                  onClick={() => setGlass(true)}
                  className={`inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-all ${
                    glass ? 'bg-card text-ink shadow-ring' : 'text-ink-55 hover:text-ink'
                  }`}
                >
                  Glass
                </button>
              </div>
            </div>

            <div className="jt-card p-6">
              <div className="mb-4 flex items-center gap-2">
                <Palette className="h-5 w-5 text-ink-55" />
                <h2 className="text-base font-medium text-ink">Your board colour</h2>
              </div>
              <p className="mb-4 text-sm leading-relaxed text-ink-55">
                This colour wraps your name on job cards so assigned work is easier to spot.
              </p>
              <BoardColorPicker
                value={boardColor}
                onChange={handleBoardColor}
                previewName={user?.full_name}
              />
              {boardColorSaving ? (
                <p className="mt-2 text-xs text-ink-40">Saving…</p>
              ) : null}
              {boardColorError ? (
                <p className="mt-2 text-sm text-danger">{boardColorError}</p>
              ) : null}
            </div>

            <div className="jt-card p-6">
              <div className="mb-4 flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-ink-55" />
                <h2 className="text-base font-medium text-ink">What&apos;s New</h2>
              </div>
              <p className="mb-4 text-sm leading-relaxed text-ink-55">
                See what changed in the latest update — useful as a checklist when testing.
              </p>
              <button type="button" className="jt-btn-ghost" onClick={() => setShowWhatsNew(true)}>
                <Sparkles className="h-4 w-4" />
                View changelog
              </button>
            </div>

            <div className="jt-card p-6">
              <div className="mb-4 flex items-center gap-2">
                <Download className="h-5 w-5 text-ink-55" />
                <h2 className="text-base font-medium text-ink">Updates</h2>
              </div>
              <p className="mb-4 text-sm leading-relaxed text-ink-55">
                Check for new versions of the application. Updates are downloaded from the
                network share.
              </p>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={handleCheckForUpdates}
                  disabled={checking}
                  className="jt-btn-ghost disabled:opacity-40"
                >
                  <RefreshCw className={`h-4 w-4 ${checking ? 'animate-spin' : ''}`} />
                  {checking ? 'Checking…' : 'Check for Updates'}
                </button>

                {updateStatus?.type === 'available' && (
                  <button onClick={handleDownloadUpdate} className="jt-btn-accent">
                    <Download className="h-4 w-4" />
                    Download v{updateStatus.version}
                  </button>
                )}

                {updateStatus?.type === 'downloaded' && (
                  <button onClick={handleInstallUpdate} className="jt-btn-accent">
                    <RotateCcw className="h-4 w-4" />
                    Restart &amp; Install
                  </button>
                )}
              </div>

              {updateStatus && (
                <div
                  className={`mt-3 rounded-xl px-4 py-3 text-sm ${
                    updateStatus.type === 'uptodate'
                      ? 'border border-success/20 bg-success/10 text-success'
                      : updateStatus.type === 'available' || updateStatus.type === 'downloaded'
                        ? 'border border-brand/20 bg-brand/10 text-brand'
                        : updateStatus.type === 'error'
                          ? 'border border-danger/20 bg-danger/10 text-danger'
                          : 'border border-ink-10 bg-ink-6 text-ink-55'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {updateStatus.type === 'checking' && <RefreshCw className="h-4 w-4 animate-spin" />}
                    {updateStatus.type === 'downloading' && <Download className="h-4 w-4" />}
                    <span>{updateStatus.text}</span>
                  </div>
                </div>
              )}
            </div>

            {message && (
              <div
                className={`rounded-xl px-4 py-3 text-sm ${
                  message.type === 'success'
                    ? 'border border-success/20 bg-success/10 text-success'
                    : 'border border-danger/20 bg-danger/10 text-danger'
                }`}
              >
                {message.text}
              </div>
            )}

            <div className="flex justify-end">
              <button
                onClick={handleSave}
                disabled={saving || dataBackend === 'selfhost' || !dbPath.trim()}
                className="jt-btn-accent disabled:opacity-40"
              >
                <Save className="h-4 w-4" />
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        )}
      </div>
      {showWhatsNew && (
        <WhatsNew forceOpen onClose={() => setShowWhatsNew(false)} />
      )}
    </div>
  );
}
