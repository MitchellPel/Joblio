import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import TitlebarDrag from './TitlebarDrag';

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  const [dbReady, setDbReady] = useState<boolean | null>(null);
  const [bridgeMissing, setBridgeMissing] = useState(false);

  useEffect(() => {
    if (!window.tracker?.getDbPath) {
      setBridgeMissing(true);
      setDbReady(false);
      return;
    }
    window.tracker.getDbPath().then((res) => {
      setDbReady(res.configured);
    }).catch(() => {
      setDbReady(false);
    });
  }, []);

  if (bridgeMissing) {
    return (
      <div className="flex h-full items-center justify-center bg-canvas px-4">
        <TitlebarDrag />
        <div className="max-w-md rounded-2xl bg-card p-6 shadow-raised">
          <p className="text-sm font-medium text-ink">Joblio did not start correctly on this PC</p>
          <p className="mt-2 text-sm text-ink-55">
            Close the app, then install again from{' '}
            <span className="font-medium text-ink">\\server\Gary\Job Tracker\updates</span>.
            Use the Joblio shortcut (not an old Signage Job Tracker icon).
          </p>
        </div>
      </div>
    );
  }

  if (loading || dbReady === null) {
    return (
      <div className="flex h-full items-center justify-center bg-canvas">
        <TitlebarDrag />
        <div className="flex flex-col items-center gap-3">
          <div className="h-9 w-9 animate-spin rounded-full border-2 border-ink-10 border-t-brand" />
          <p className="text-sm text-ink-55">Loading Joblio…</p>
        </div>
      </div>
    );
  }

  if (!dbReady) {
    return <Navigate to="/setup" replace />;
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
