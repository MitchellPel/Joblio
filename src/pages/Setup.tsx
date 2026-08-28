import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { FolderOpen } from 'lucide-react';
import JoblioLogo from '../components/JoblioLogo';
import TitlebarDrag from '../components/TitlebarDrag';

export default function Setup() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const [folderPath, setFolderPath] = useState('');
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

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

  async function handleSave() {
    if (!folderPath.trim()) return;
    setStatus('idle');
    setMessage('');

    const result = await window.tracker.setDbPath(folderPath.trim());
    if ('error' in result) {
      setStatus('error');
      setMessage(result.error);
    } else {
      setStatus('success');
      setMessage('Database created!');
      setTimeout(() => navigate('/login'), 1000);
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
            Choose a shared network folder for the job database. Every shop PC must reach this
            path so the team stays in sync.
          </p>
        </div>

        <div className="rounded-2xl bg-card p-8 shadow-raised">
          <label className="jt-label">Shared folder path</label>
          <div className="mb-4 flex gap-2">
            <input
              type="text"
              value={folderPath}
              onChange={(e) => setFolderPath(e.target.value)}
              placeholder="\\SERVER\SharedFolder\jobs.db"
              className="jt-input font-mono text-[13px]"
            />
            <button onClick={handlePickFolder} className="jt-btn-primary shrink-0">
              <FolderOpen className="h-4 w-4" />
              Browse
            </button>
          </div>

          {message && (
            <p
              className={`mb-4 text-sm ${status === 'error' ? 'text-danger' : 'text-success'}`}
            >
              {message}
            </p>
          )}

          <button
            onClick={handleSave}
            disabled={!folderPath.trim()}
            className="jt-btn-accent w-full !py-2.5 disabled:opacity-40"
          >
            Save & Continue
          </button>
        </div>
      </div>
    </div>
  );
}
