import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface AppModalProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  maxWidth?: 'md' | 'lg' | 'xl';
}

export default function AppModal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  maxWidth = 'md',
}: AppModalProps) {
  // Only close when the press *starts* on the dim backdrop — otherwise
  // highlighting text and releasing outside the field would dismiss the modal.
  const backdropPressRef = useRef(false);

  useEffect(() => {
    if (!open) return;

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }

    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  const maxW =
    maxWidth === 'xl' ? 'max-w-2xl' : maxWidth === 'lg' ? 'max-w-lg' : 'max-w-md';

  return createPortal(
    <div
      className="jt-below-titlebar jt-anim-overlay fixed inset-x-0 bottom-0 z-[100] flex items-end justify-center bg-ink/40 sm:items-center sm:p-4"
      onMouseDown={(e) => {
        backdropPressRef.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (backdropPressRef.current && e.target === e.currentTarget) {
          onClose();
        }
        backdropPressRef.current = false;
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className={`jt-anim-panel jt-sheet flex max-h-full w-full ${maxW} flex-col overflow-hidden rounded-t-2xl bg-canvas shadow-raised sm:max-h-full sm:rounded-2xl`}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-ink-10 px-4 py-3 sm:px-5 sm:py-4">
          <div className="min-w-0 flex-1">
            <h2 className="font-medium text-ink">{title}</h2>
            {subtitle != null && <p className="mt-0.5 text-xs text-ink-40">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg p-2 text-ink-40 hover:bg-ink-6 hover:text-ink"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain jt-scroll p-4 sm:p-5">
          {children}
        </div>

        {footer && (
          <div className="shrink-0 border-t border-ink-10 p-4">{footer}</div>
        )}
      </div>
    </div>,
    document.body
  );
}
