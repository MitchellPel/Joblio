import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { FolderOpen } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import JoblioLogo from '../components/JoblioLogo';
import TitlebarDrag from '../components/TitlebarDrag';

function isApiKeyMissingError(msg: string): boolean {
  const m = msg.toLowerCase();
  return m.includes('api key missing') || m.includes('joblio-api-key');
}

export default function Login() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loadingCredentials, setLoadingCredentials] = useState(true);
  const [pickingShare, setPickingShare] = useState(false);
  const [shareHint, setShareHint] = useState('');
  const loadedRef = useRef(false);

  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;

    if (!window.tracker?.loadCredentials) {
      setLoadingCredentials(false);
      setError(
        'Joblio did not start correctly. Reinstall from \\\\server\\D\\Joblio DB\\Jobtracker\\updates'
      );
      return;
    }

    window.tracker
      .loadCredentials()
      .then((creds) => {
        if (creds) {
          setUsername(creds.username);
          setPassword(creds.password);
          setRememberMe(true);
        }
      })
      .catch(() => {})
      .finally(() => {
        setLoadingCredentials(false);
      });

    window.tracker
      .getShareRoot?.()
      .then((r) => {
        if (r?.path) setShareHint(r.path);
      })
      .catch(() => {});
  }, []);

  async function handlePickShareRoot() {
    if (!window.tracker.pickShareRoot) return;
    setPickingShare(true);
    setError('');
    try {
      const result = await window.tracker.pickShareRoot();
      if ('cancelled' in result) return;
      if ('error' in result) {
        setError(result.error);
        return;
      }
      setShareHint(result.path);
      setError('');
      // If they already typed credentials, try signing in again.
      if (username.trim() && password) {
        setBusy(true);
        const loginResult = await login(username, password);
        if (loginResult.error) {
          setError(loginResult.error);
          setBusy(false);
        } else {
          if (rememberMe) {
            await window.tracker.saveCredentials({ username, password }).catch(() => {});
          } else {
            await window.tracker.clearCredentials().catch(() => {});
          }
          navigate('/board');
        }
      }
    } finally {
      setPickingShare(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);

    const result = await login(username, password);
    if (result.error) {
      setError(result.error);
      setBusy(false);
    } else {
      if (rememberMe) {
        await window.tracker.saveCredentials({ username, password }).catch(() => {});
      } else {
        await window.tracker.clearCredentials().catch(() => {});
      }
      navigate('/board');
    }
  }

  const showLocateShare = !!error && isApiKeyMissingError(error);

  return (
    <div className="relative flex h-full items-center justify-center bg-canvas px-4">
      <TitlebarDrag />
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -left-24 -top-24 h-72 w-72 rounded-full bg-surface opacity-80" />
        <div className="absolute -bottom-32 -right-16 h-96 w-96 rounded-full bg-surface-warm opacity-70" />
      </div>

      <div className="relative w-full max-w-sm">
        <div className="mb-8 text-center">
          <JoblioLogo className="mx-auto mb-2 h-44 w-auto max-w-[420px] object-contain" />
          <p className="mt-1.5 text-sm text-ink-55">Built for production. By production.</p>
        </div>

        <div className="jt-card rounded-2xl p-8 shadow-raised">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="jt-label">Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="jt-input"
                placeholder="Enter username"
                required
                autoFocus
                disabled={loadingCredentials}
                spellCheck={false}
                autoComplete="username"
              />
            </div>
            <div>
              <label className="jt-label">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="jt-input"
                placeholder="Enter password"
                required
                disabled={loadingCredentials}
                spellCheck={false}
                autoComplete="current-password"
              />
            </div>

            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="h-4 w-4 rounded border-ink-20 text-brand focus:ring-brand/30"
              />
              <span className="text-sm text-ink-55">Remember me</span>
            </label>

            {error && <p className="text-sm text-danger">{error}</p>}

            {showLocateShare && (
              <div className="rounded-xl border border-ink-10 bg-surface px-3 py-3">
                <p className="text-xs text-ink-55">
                  Joblio needs the shop share that contains{' '}
                  <span className="font-mono text-ink">joblio-api-key.txt</span>
                  {shareHint ? (
                    <>
                      .<br />
                      Current: <span className="break-all font-mono text-[11px] text-ink">{shareHint}</span>
                    </>
                  ) : (
                    <>
                      {' '}
                      (usually <span className="font-mono text-ink">\\server\D\Joblio DB\Jobtracker</span>).
                    </>
                  )}
                </p>
                <button
                  type="button"
                  onClick={handlePickShareRoot}
                  disabled={pickingShare || busy}
                  className="jt-btn-accent mt-2 w-full !justify-center disabled:opacity-50"
                >
                  <FolderOpen className="h-4 w-4" />
                  {pickingShare ? 'Opening…' : 'Locate share folder'}
                </button>
              </div>
            )}

            <button
              type="submit"
              disabled={busy || loadingCredentials}
              className="jt-btn-accent w-full !py-2.5 disabled:opacity-50"
            >
              {loadingCredentials ? 'Loading…' : busy ? 'Connecting…' : 'Sign In'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
