import { useState, useEffect, useMemo, type ReactNode } from 'react';
import { FolderOpen, Save, HardDrive, RefreshCw, Download, RotateCcw, Sun, Moon, Sparkles, Monitor, Cloud, Bot } from 'lucide-react';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import WhatsNew from '../components/WhatsNew';
import FeedbackPanel from '../components/FeedbackPanel';
import BoardColorPicker from '../components/BoardColorPicker';

type JobsSource = 'shop' | 'folder' | 'local';

function inferJobsSource(backend: 'sqlite' | 'selfhost', dbPath: string): JobsSource {
  if (backend === 'selfhost') return 'shop';
  const n = dbPath.replace(/\//g, '\\').toLowerCase();
  if (n.includes('\\signage-job-tracker\\jobs.db')) return 'local';
  return 'folder';
}

function SegBtn({
  active,
  disabled,
  onClick,
  children,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-all disabled:opacity-40 ${
        active ? 'bg-card text-ink shadow-ring' : 'text-ink-55 hover:text-ink'
      }`}
    >
      {children}
    </button>
  );
}

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
    setSaving(true);
    setMessage(null);
    if (dataBackend === 'selfhost') {
      const switched = await window.tracker.setDataBackend('sqlite');
      if ('error' in switched) {
        setMessage({ type: 'error', text: switched.error });
        setSaving(false);
        return;
      }
      setDataBackendState(switched.backend);
      setDataBackendNeedsRestart(!!switched.needsRestart);
    }
    const result = await window.tracker.useLocalDb();
    if ('error' in result) {
      setMessage({ type: 'error', text: result.error });
    } else {
      setDbPath(result.path);
      setMessage({ type: 'success', text: 'Jobs will stay on this PC. Restart Joblio if you just left the shop server.' });
    }
    setSaving(false);
  }

  async function handleSave() {
    if (dataBackend === 'selfhost') {
      setMessage({ type: 'error', text: 'Shop server does not use a folder path.' });
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
      setMessage({ type: 'success', text: 'Folder saved.' });
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
          ? 'Jobs will load from the shop server. Restart Joblio to apply.'
          : 'Jobs will use a file on this PC or a shared folder. Restart Joblio to apply.',
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

  const jobsSource = useMemo(() => inferJobsSource(dataBackend, dbPath), [dataBackend, dbPath]);

  async function handleJobsSource(source: JobsSource) {
    if (dataBackendLocked) return;
    if (source === 'shop') {
      await handleDataBackend('selfhost');
      return;
    }
    if (source === 'local') {
      await handleUseThisPc();
      return;
    }
    if (dataBackend === 'selfhost') {
      await handleDataBackend('sqlite');
    }
  }

  return (
    <div className="jt-page flex flex-col overflow-hidden p-6">
      <div className="jt-scroll mx-auto min-h-0 w-full max-w-2xl flex-1 overflow-y-auto">
        <p className="jt-eyebrow mb-1">Workspace</p>
        <h1 className="jt-section-title mb-6">Settings</h1>

        {loading ? (
          <p className="text-ink-40">Loading settings…</p>
        ) : (
          <div className="space-y-5 pb-8">
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

            <section className="jt-card p-5">
              <p className="jt-eyebrow mb-1">You</p>
              <h2 className="mb-1 text-base font-medium text-ink">Look &amp; colour</h2>
              <p className="mb-4 text-sm text-ink-55">Saved on this PC. Your name colour shows on job cards.</p>
              <div className="mb-4 inline-flex rounded-lg border border-ink-10 bg-surface-soft p-1">
                <SegBtn active={theme === 'light'} onClick={() => setTheme('light')}>
                  <Sun className="h-4 w-4" />
                  Light
                </SegBtn>
                <SegBtn active={theme === 'dark'} onClick={() => setTheme('dark')}>
                  <Moon className="h-4 w-4" />
                  Dark
                </SegBtn>
              </div>
              <div className="mb-5 inline-flex rounded-lg border border-ink-10 bg-surface-soft p-1">
                <SegBtn active={!glass} onClick={() => setGlass(false)}>
                  Standard
                </SegBtn>
                <SegBtn active={glass} onClick={() => setGlass(true)}>
                  Glass
                </SegBtn>
              </div>
              <BoardColorPicker
                value={boardColor}
                onChange={handleBoardColor}
                previewName={user?.full_name}
              />
              {boardColorSaving ? <p className="mt-2 text-xs text-ink-40">Saving…</p> : null}
              {boardColorError ? <p className="mt-2 text-sm text-danger">{boardColorError}</p> : null}
            </section>

            <section className="jt-card p-5">
              <p className="jt-eyebrow mb-1">This PC</p>
              <h2 className="mb-1 text-base font-medium text-ink">Display &amp; updates</h2>
              <p className="mb-4 text-sm text-ink-55">
                Compatible graphics is safest on shop laptops. Shop PCs pick up updates from the
                office folder; home installs use GitHub.
              </p>
              <div className="mb-4 inline-flex rounded-lg border border-ink-10 bg-surface-soft p-1">
                <SegBtn active={graphicsMode === 'soft'} onClick={() => handleGraphicsMode('soft')}>
                  <Monitor className="h-4 w-4" />
                  Compatible
                </SegBtn>
                <SegBtn active={graphicsMode === 'hard'} onClick={() => handleGraphicsMode('hard')}>
                  Performance
                </SegBtn>
              </div>
              {graphicsNeedsRestart && (
                <div className="mb-4 flex flex-wrap items-center gap-2">
                  <p className="text-sm text-ink-55">Restart to apply graphics.</p>
                  <button type="button" className="jt-btn-ghost" onClick={() => window.tracker.relaunchApp()}>
                    <RotateCcw className="h-4 w-4" />
                    Restart now
                  </button>
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={handleCheckForUpdates}
                  disabled={checking}
                  className="jt-btn-ghost disabled:opacity-40"
                >
                  <RefreshCw className={`h-4 w-4 ${checking ? 'animate-spin' : ''}`} />
                  {checking ? 'Checking…' : 'Check for updates'}
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
                <button type="button" className="jt-btn-ghost" onClick={() => setShowWhatsNew(true)}>
                  <Sparkles className="h-4 w-4" />
                  What&apos;s New
                </button>
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
            </section>

            <section className="jt-card p-5">
              <p className="jt-eyebrow mb-1">Jobs</p>
              <h2 className="mb-1 text-base font-medium text-ink">Where work is stored</h2>
              <p className="mb-4 text-sm text-ink-55">
                Shop server is the usual office choice. Network folder is a shared jobs file.
                This PC only is for a single computer at home.
              </p>
              <div className="mb-4 flex flex-col gap-1 rounded-lg border border-ink-10 bg-surface-soft p-1 sm:inline-flex sm:flex-row">
                <SegBtn
                  active={jobsSource === 'shop'}
                  disabled={dataBackendLocked}
                  onClick={() => handleJobsSource('shop')}
                >
                  <Cloud className="h-4 w-4" />
                  Shop server
                </SegBtn>
                <SegBtn
                  active={jobsSource === 'folder'}
                  disabled={dataBackendLocked}
                  onClick={() => handleJobsSource('folder')}
                >
                  <HardDrive className="h-4 w-4" />
                  Network folder
                </SegBtn>
                <SegBtn
                  active={jobsSource === 'local'}
                  disabled={dataBackendLocked || saving}
                  onClick={() => handleJobsSource('local')}
                >
                  <Monitor className="h-4 w-4" />
                  This PC only
                </SegBtn>
              </div>
              {dataBackendLocked && (
                <p className="mb-3 text-xs text-ink-40">This choice is locked by how Joblio was started.</p>
              )}
              {dataBackendNeedsRestart && !dataBackendLocked && (
                <div className="mb-4 flex flex-wrap items-center gap-2">
                  <p className="text-sm text-ink-55">Restart Joblio to finish switching.</p>
                  <button type="button" className="jt-btn-ghost" onClick={() => window.tracker.relaunchApp()}>
                    <RotateCcw className="h-4 w-4" />
                    Restart now
                  </button>
                </div>
              )}
              {jobsSource !== 'shop' && (
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={dbPath}
                      onChange={(e) => setDbPath(e.target.value)}
                      placeholder="\\SERVER\SharedFolder\jobs.db"
                      className="jt-input font-mono text-[13px]"
                    />
                    <button onClick={handlePickFolder} className="jt-btn-ghost shrink-0">
                      <FolderOpen className="h-4 w-4" />
                      Browse
                    </button>
                  </div>
                  <div className="flex justify-end">
                    <button
                      onClick={handleSave}
                      disabled={saving || !dbPath.trim()}
                      className="jt-btn-accent disabled:opacity-40"
                    >
                      <Save className="h-4 w-4" />
                      {saving ? 'Saving…' : 'Save folder'}
                    </button>
                  </div>
                </div>
              )}
            </section>

            {isAdmin && (
              <details className="jt-card p-5">
                <summary className="flex cursor-pointer list-none items-center gap-2 text-ink">
                  <Bot className="h-5 w-5 text-ink-55" />
                  <span>
                    <span className="jt-eyebrow block">Admin</span>
                    <span className="text-base font-medium">Joblio AI</span>
                  </span>
                </summary>
                <p className="mb-4 mt-3 text-sm text-ink-55">
                  Optional. Run a model on this PC, or a cloud API. The key stays on this computer.
                </p>
                {aiSource === 'share-file' && aiProvider === 'ollama' && (
                  <p className="mb-3 text-xs text-ink-40">
                    Using the office share file until you save a choice here.
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
              </details>
            )}

            <FeedbackPanel />

          </div>
        )}
      </div>
      {showWhatsNew && (
        <WhatsNew forceOpen onClose={() => setShowWhatsNew(false)} />
      )}
    </div>
  );
}
