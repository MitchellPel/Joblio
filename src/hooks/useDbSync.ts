import { useEffect } from 'react';

/**
 * Re-run `onRefresh` whenever another team member changes the shared database.
 * Pass `silent: true` in your refresh fn to avoid loading spinners on background sync.
 * Also refreshes when the window becomes visible again (alt-tab / unminimize).
 */
export function useDbSync(onRefresh: () => void, enabled = true): void {
  useEffect(() => {
    if (!enabled) return;

    const unsubscribe = window.tracker.onDbChanged(onRefresh);
    const onVisible = () => {
      if (document.visibilityState === 'visible') onRefresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      unsubscribe();
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [onRefresh, enabled]);
}
