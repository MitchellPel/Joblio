import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FolderOpen, Monitor } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import JoblioLogo from '../components/JoblioLogo';
import TitlebarDrag from '../components/TitlebarDrag';

export default function Setup() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const [folderPath, setFolderPath] = useState('');
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    checkSetup();
  }, []);

  async function checkSetup() {
    const res = await window.tracker.getDbPath();
    if (res.configured) {
      navigate(session ? '/board' : '/login');
    }
  }

  async function handlePickFolder() {
    const p = await window.tracker.pickFolder();
    if (p) setFolderPath(p);
  }

  async function finishOk() {
    setStatus('success');
    setMessage('Database ready.');
    setTimeout(() => navigate('/login'), 800);
  }

  async function handleUseThisPc() {
    setBusy(true);
    setStatus('idle');
    setMessage('');
    const result = await window.tracker.useLocalDb();
    setBusy(false);
    if ('error' in result) {
      setStatus('error');
      setMessage(result.error);
      return;
    }
    await finishOk();
  }

  async function handleSaveShare() {
    if (!folderPath.trim()) return;
    setBusy(true);
    setStatus('idle');
    setMessage('');

    const result = await window.tracker.setDbPath(folderPath.trim());
    setBusy(false);
    if ('error' in result) {
      setStatus('error');
      setMessage(result.error);
    } else {
      await finishOk();
    }
  }

  return (
    <div className="relative flex h-full items-center justify-center bg-canvas px-4">
      <TitlebarDrag />
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -left-24 top-1/4 h-64 w-64 rounded-full bg-surface opacity-70" />
        <div className="absolute bottom-0 right-0 h-80 w-80 rounded-full bg-surface-warm opacity-60" />
      </div>

      <div className="relative w-full max-w-lg">
        <div className="mb-6">
          <JoblioLogo className="mb-4 h-20 w-auto max-w-[280px] object-contain" />
          <h1 className="text-3xl font-medium tracking-display text-ink">Welcome to Joblio</h1>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-55">
            Track jobs on this PC, or point every shop computer at one shared folder.
          </p>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl bg-card p-6 shadow-raised">
            <h2 className="text-base font-medium text-ink">This computer only</h2>
            <p className="mt-1 text-sm leading-relaxed text-ink-55">
              Jobs stay on this PC. No network share or server required.
            </p>
            <button
              type="button"
              onClick={handleUseThisPc}
              disabled={busy}
              className="jt-btn-accent mt-4 w-full !py-2.5 disabled:opacity-40"
            >
              <Monitor className="h-4 w-4" />
              Start on this PC
            </button>
          </div>

          <div className="rounded-2xl bg-card p-6 shadow-raised">
            <h2 className="text-base font-medium text-ink">Shared folder (team)</h2>
            <p className="mt-1 mb-4 text-sm leading-relaxed text-ink-55">
              Every shop PC must reach this path so the board stays in sync.
            </p>
            <label className="jt-label">Folder for jobs.db</label>
            <div className="mb-4 flex gap-2">
              <input
                type="text"
                value={folderPath}
                onChange={(e) => setFolderPath(e.target.value)}
                placeholder="\\SERVER\SharedFolder\jobs.db"
                className="jt-input font-mono text-[13px]"
              />
              <button type="button" onClick={handlePickFolder} className="jt-btn-primary shrink-0">
                <FolderOpen className="h-4 w-4" />
                Browse
              </button>
            </div>
            <button
              type="button"
              onClick={handleSaveShare}
              disabled={!folderPath.trim() || busy}
              className="jt-btn-ghost w-full !py-2.5 disabled:opacity-40"
            >
              Use shared folder
            </button>
          </div>
        </div>

        {message && (
          <p className={`mt-4 text-sm ${status === 'error' ? 'text-danger' : 'text-success'}`}>
            {message}
          </p>
        )}
      </div>
    </div>
  );
}
