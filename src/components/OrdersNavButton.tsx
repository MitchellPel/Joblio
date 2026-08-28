import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useDbSync } from '../hooks/useDbSync';

/** Orders text link + unseen badge — sits before Search in the navbar. */
export default function OrdersNavButton() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [unseen, setUnseen] = useState(0);
  const active = location.pathname === '/orders';

  const refresh = useCallback(async () => {
    if (!token) {
      setUnseen(0);
      return;
    }
    try {
      const result = await window.tracker.listUnseenOrderIds(token);
      if (Array.isArray(result)) setUnseen(result.length);
    } catch {
      // keep last count
    }
  }, [token]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Other PCs don't get the create-time IPC event — refresh when shared DB changes.
  useDbSync(() => {
    void refresh();
  }, !!token);

  useEffect(() => {
    if (!token) return;
    const unsubNew = window.tracker.onOrdersChanged(() => refresh());
    const unsubOpen = window.tracker.onOrderOpen(() => {
      navigate('/orders');
    });
    const onRefresh = () => refresh();
    window.addEventListener('joblio:orders-refresh', onRefresh);
    return () => {
      unsubNew();
      unsubOpen();
      window.removeEventListener('joblio:orders-refresh', onRefresh);
    };
  }, [token, refresh, navigate]);

  return (
    <button
      type="button"
      onClick={() => navigate('/orders')}
      className={`relative rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors ${
        active
          ? 'bg-surface-warm text-ink shadow-ring'
          : 'text-ink-55 hover:bg-ink-6 hover:text-ink'
      }`}
      title={unseen > 0 && !active ? `${unseen} new order${unseen === 1 ? '' : 's'}` : 'Orders'}
      aria-label={unseen > 0 && !active ? `Orders, ${unseen} new` : 'Orders'}
    >
      Orders
      {unseen > 0 && !active && (
        <span className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">
          {unseen > 9 ? '9+' : unseen}
        </span>
      )}
    </button>
  );
}
