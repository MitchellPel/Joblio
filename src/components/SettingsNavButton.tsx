import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Settings as SettingsIcon } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useDbSync } from '../hooks/useDbSync';

export default function SettingsNavButton() {
  const { token, isAdmin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [unseen, setUnseen] = useState(0);
  const active = location.pathname === '/settings';

  const refresh = useCallback(async () => {
    if (!token || !isAdmin) {
      setUnseen(0);
      return;
    }
    try {
      const result = await window.tracker.feedbackUnseenCount(token);
      if (!('error' in result)) setUnseen(result.count);
    } catch {
      // keep last
    }
  }, [token, isAdmin]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useDbSync(() => {
    void refresh();
  }, !!token && isAdmin);

  useEffect(() => {
    if (!token) return;
    const unsubNew = window.tracker.onFeedbackChanged(() => refresh());
    const unsubOpen = window.tracker.onFeedbackOpen(() => {
      navigate('/settings');
    });
    const onRefresh = () => refresh();
    window.addEventListener('joblio:feedback-refresh', onRefresh);
    return () => {
      unsubNew();
      unsubOpen();
      window.removeEventListener('joblio:feedback-refresh', onRefresh);
    };
  }, [token, refresh, navigate]);

  return (
    <button
      type="button"
      onClick={() => navigate('/settings')}
      className={`relative rounded-lg p-2 transition-colors ${
        active ? 'bg-surface-warm text-ink shadow-ring' : 'text-ink-55 hover:bg-ink-6 hover:text-ink'
      }`}
      title={unseen > 0 ? `Settings, ${unseen} new report${unseen === 1 ? '' : 's'}` : 'Settings'}
      aria-label={unseen > 0 ? `Settings, ${unseen} new` : 'Settings'}
    >
      <SettingsIcon className="h-4 w-4" />
      {unseen > 0 && !active && (
        <span className="absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">
          {unseen > 9 ? '9+' : unseen}
        </span>
      )}
    </button>
  );
}
