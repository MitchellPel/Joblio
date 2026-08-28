import { useState, useEffect, useCallback } from 'react';
import { Download, RotateCcw, X } from 'lucide-react';
import type { UpdateInfo, DownloadProgress } from '../electron-api';

type Phase = 'idle' | 'available' | 'downloading' | 'downloaded' | 'error';

export default function UpdateNotification() {
  const [phase, setPhase] = useState<Phase>('idle');
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [progress, setProgress] = useState<number>(0);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const unsubAvailable = window.tracker.onUpdateAvailable((updateInfo) => {
      setInfo(updateInfo);
      setPhase('available');
      setDismissed(false);
    });

    const unsubProgress = window.tracker.onDownloadProgress((p: DownloadProgress) => {
      setProgress(p.percent);
      setPhase('downloading');
    });

    const unsubDownloaded = window.tracker.onUpdateDownloaded((updateInfo) => {
      setInfo(updateInfo);
      setProgress(100);
      setPhase('downloaded');
    });

    const unsubError = window.tracker.onUpdateError((msg) => {
      setErrorMsg(msg);
      setPhase('error');
    });

    return () => {
      unsubAvailable();
      unsubProgress();
      unsubDownloaded();
      unsubError();
    };
  }, []);

  const handleDownload = useCallback(async () => {
    setPhase('downloading');
    setProgress(0);
    const result = await window.tracker.downloadUpdate();
    if ('error' in result) {
      setErrorMsg(result.error);
      setPhase('error');
    }
  }, []);

  const handleInstall = useCallback(async () => {
    await window.tracker.installNow();
  }, []);

  const handleDismiss = useCallback(() => {
    setDismissed(true);
  }, []);

  if (dismissed || phase === 'idle') return null;

  return (
    <div className="fixed bottom-4 right-4 z-[250] max-w-sm animate-in slide-in-from-right-4 fade-in">
      <div className="rounded-xl border border-ink-10 bg-card p-4 shadow-raised">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            {phase === 'available' && (
              <>
                <div className="flex items-center gap-2">
                  <Download className="h-4 w-4 text-brand" />
                  <p className="text-sm font-medium text-ink">
                    Update available
                  </p>
                </div>
                <p className="mt-1 text-xs text-ink-55">
                  Version {info?.version} is ready to download
                </p>
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={handleDownload}
                    className="rounded-lg bg-ink px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-ink-90"
                  >
                    Download
                  </button>
                  <button
                    onClick={handleDismiss}
                    className="rounded-lg px-3 py-1.5 text-xs font-medium text-ink-55 transition-colors hover:bg-ink-6"
                  >
                    Later
                  </button>
                </div>
              </>
            )}

            {phase === 'downloading' && (
              <>
                <div className="flex items-center gap-2">
                  <Download className="h-4 w-4 text-brand" />
                  <p className="text-sm font-medium text-ink">
                    Downloading update…
                  </p>
                </div>
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-ink-6">
                  <div
                    className="h-full rounded-full bg-brand transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <p className="mt-1 text-xs text-ink-40">{progress}%</p>
              </>
            )}

            {phase === 'downloaded' && (
              <>
                <div className="flex items-center gap-2">
                  <RotateCcw className="h-4 w-4 text-brand" />
                  <p className="text-sm font-medium text-ink">
                    Update ready
                  </p>
                </div>
                <p className="mt-1 text-xs text-ink-55">
                  Version {info?.version} downloaded. Restart to apply.
                </p>
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={handleInstall}
                    className="rounded-lg bg-ink px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-ink-90"
                  >
                    Restart now
                  </button>
                  <button
                    onClick={handleDismiss}
                    className="rounded-lg px-3 py-1.5 text-xs font-medium text-ink-55 transition-colors hover:bg-ink-6"
                  >
                    Later
                  </button>
                </div>
              </>
            )}

            {phase === 'error' && (
              <>
                <div className="flex items-center gap-2">
                  <X className="h-4 w-4 text-danger" />
                  <p className="text-sm font-medium text-ink">
                    Update failed
                  </p>
                </div>
                <p className="mt-1 text-xs text-ink-55">{errorMsg}</p>
                <div className="mt-3">
                  <button
                    onClick={handleDismiss}
                    className="rounded-lg px-3 py-1.5 text-xs font-medium text-ink-55 transition-colors hover:bg-ink-6"
                  >
                    Dismiss
                  </button>
                </div>
              </>
            )}
          </div>

          <button
            onClick={handleDismiss}
            className="shrink-0 rounded-md p-1 text-ink-40 transition-colors hover:bg-ink-6 hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
