import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Bot } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

/** Joblio AI — admin or staff with can_use_ai. */
export default function AiNavButton() {
  const { token, isAdmin, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [allowed, setAllowed] = useState(isAdmin || !!user?.can_use_ai);
  const active = location.pathname === '/ai' || location.pathname === '/estimates';

  const refresh = useCallback(async () => {
    if (!token) {
      setAllowed(false);
      return;
    }
    try {
      const perms = await window.tracker.aiPermissions(token);
      if (!('error' in perms)) setAllowed(!!perms.can_use);
    } catch {
      setAllowed(isAdmin || !!user?.can_use_ai);
    }
  }, [token, isAdmin, user?.can_use_ai]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (!allowed) return null;

  return (
    <button
      type="button"
      onClick={() => navigate('/ai')}
      className={`shrink-0 rounded-pill transition-opacity ${
        active ? 'ring-2 ring-success/50 ring-offset-1 ring-offset-canvas' : 'hover:opacity-90'
      }`}
      title="Joblio AI"
      aria-label="Joblio AI"
    >
      <span className="inline-flex w-fit max-w-full min-w-0 items-center gap-1 truncate rounded-pill bg-success px-1.5 py-0.5 text-xs font-semibold text-white sm:px-2 sm:text-sm">
        <Bot className="h-3.5 w-3.5 shrink-0" aria-hidden />
        Joblio AI
      </span>
    </button>
  );
}
