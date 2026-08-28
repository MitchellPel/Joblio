import { useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import type { JobProof } from '@/shared-types';
import { X, Download, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Printer } from 'lucide-react';
import { bytesFromBase64 } from '../utils/proofBytes';
import { printImageBlob } from '../utils/printImage';

interface ProofLightboxProps {
  proofs: JobProof[];
  startIndex: number;
  token: string | null;
  onClose: () => void;
}

/** Full-screen proof viewer — always dark chrome + white text (theme-independent). */
export default function ProofLightbox({ proofs, startIndex, token, onClose }: ProofLightboxProps) {
  const [index, setIndex] = useState(startIndex);
  const [src, setSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [zoom, setZoom] = useState(1);

  const proof = proofs[index];

  const loadProof = useCallback(async (proofId: number) => {
    if (!token) {
      setError('Not signed in.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    setSrc((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setZoom(1);

    const result = await window.tracker.getProof(token, proofId);
    if ('error' in result) {
      setError(result.error);
      setLoading(false);
      return;
    }
    const blob = new Blob([bytesFromBase64(result.dataBase64)], { type: result.mime_type });
    const url = URL.createObjectURL(blob);
    setSrc(url);
    setLoading(false);
  }, [token]);

  useEffect(() => {
    if (proof) loadProof(proof.id);
    return () => {
      setSrc((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    };
  }, [proof?.id, loadProof]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') setIndex((i) => (i <= 0 ? proofs.length - 1 : i - 1));
      if (e.key === 'ArrowRight') setIndex((i) => (i >= proofs.length - 1 ? 0 : i + 1));
      if (e.key === '+' || e.key === '=') setZoom((z) => Math.min(4, z + 0.25));
      if (e.key === '-') setZoom((z) => Math.max(0.5, z - 0.25));
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, proofs.length]);

  function goPrev() {
    setIndex((i) => (i <= 0 ? proofs.length - 1 : i - 1));
  }

  function goNext() {
    setIndex((i) => (i >= proofs.length - 1 ? 0 : i + 1));
  }

  async function handleDownload() {
    if (!token || !proof) return;
    const result = await window.tracker.getProof(token, proof.id);
    if ('error' in result) {
      setError(result.error);
      return;
    }
    const blob = new Blob([bytesFromBase64(result.dataBase64)], { type: result.mime_type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = result.file_name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function handlePrint() {
    if (!token || !proof) return;
    const result = await window.tracker.getProof(token, proof.id);
    if ('error' in result) {
      setError(result.error);
      return;
    }
    printImageBlob(
      new Blob([bytesFromBase64(result.dataBase64)], { type: result.mime_type }),
      proof.file_name
    );
  }

  if (!proof) return null;

  const overlay = (
    <div
      className="jt-below-titlebar fixed inset-x-0 bottom-0 z-[30000] flex flex-col"
      style={{ backgroundColor: 'rgba(10, 10, 10, 0.96)', color: '#ffffff' }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Proof image viewer"
    >
      {/* Top bar — always white text on dark */}
      <div
        className="flex shrink-0 flex-wrap items-center justify-between gap-2 px-4 py-2.5"
        style={{ color: '#ffffff', backgroundColor: 'rgba(0,0,0,0.55)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="min-w-0">
          <p className="truncate text-sm font-medium" style={{ color: '#ffffff' }}>
            {proof.file_name}
          </p>
          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.65)' }}>
            {proof.uploaded_name || 'Staff'} · {new Date(proof.created_at).toLocaleString()}
            {proofs.length > 1 && (
              <span style={{ color: 'rgba(255,255,255,0.45)', marginLeft: 8 }}>
                {index + 1} of {proofs.length}
              </span>
            )}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}
            className="rounded-lg p-2 transition-colors hover:bg-white/15"
            style={{ color: 'rgba(255,255,255,0.85)' }}
            title="Zoom out"
          >
            <ZoomOut className="h-5 w-5" />
          </button>
          <span className="min-w-[3rem] text-center text-xs" style={{ color: 'rgba(255,255,255,0.65)' }}>
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(4, z + 0.25))}
            className="rounded-lg p-2 transition-colors hover:bg-white/15"
            style={{ color: 'rgba(255,255,255,0.85)' }}
            title="Zoom in"
          >
            <ZoomIn className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={handleDownload}
            className="ml-1 flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:bg-white/25"
            style={{ backgroundColor: 'rgba(255,255,255,0.18)', color: '#ffffff' }}
            title="Download"
          >
            <Download className="h-4 w-4" />
            Download
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:bg-white/25"
            style={{ backgroundColor: 'rgba(255,255,255,0.18)', color: '#ffffff' }}
            title="Print"
          >
            <Printer className="h-4 w-4" />
            Print
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 transition-colors hover:bg-white/15"
            style={{ color: 'rgba(255,255,255,0.85)' }}
            title="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Image fills almost the whole window */}
      <div className="relative flex min-h-0 flex-1 items-center justify-center">
        {proofs.length > 1 && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              goPrev();
            }}
            className="absolute left-3 z-10 rounded-full p-3 transition-colors hover:bg-white/20"
            style={{ backgroundColor: 'rgba(255,255,255,0.12)', color: '#ffffff' }}
            title="Previous"
          >
            <ChevronLeft className="h-7 w-7" />
          </button>
        )}

        <div
          className="flex h-full w-full items-center justify-center overflow-auto px-16 py-2"
          onClick={(e) => e.stopPropagation()}
        >
          {loading && (
            <div className="flex flex-col items-center gap-3" style={{ color: 'rgba(255,255,255,0.7)' }}>
              <div
                className="h-8 w-8 animate-spin rounded-full border-2"
                style={{ borderColor: 'rgba(255,255,255,0.2)', borderTopColor: '#ffffff' }}
              />
              <p className="text-sm">Loading image…</p>
            </div>
          )}
          {error && !loading && (
            <p className="text-sm" style={{ color: '#fca5a5' }}>{error}</p>
          )}
          {src && !loading && (
            <img
              src={src}
              alt={proof.file_name}
              className="object-contain transition-transform duration-150"
              style={{
                maxHeight: 'calc(100vh - 7.5rem)',
                maxWidth: 'calc(100vw - 6rem)',
                width: 'auto',
                height: 'auto',
                transform: `scale(${zoom})`,
                transformOrigin: 'center center',
              }}
              draggable={false}
            />
          )}
        </div>

        {proofs.length > 1 && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              goNext();
            }}
            className="absolute right-3 z-10 rounded-full p-3 transition-colors hover:bg-white/20"
            style={{ backgroundColor: 'rgba(255,255,255,0.12)', color: '#ffffff' }}
            title="Next"
          >
            <ChevronRight className="h-7 w-7" />
          </button>
        )}
      </div>

      {proofs.length > 1 && (
        <div
          className="flex shrink-0 justify-center gap-2 overflow-x-auto px-4 py-3"
          style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}
          onClick={(e) => e.stopPropagation()}
        >
          {proofs.map((p, i) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setIndex(i)}
              className="shrink-0 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors"
              style={
                i === index
                  ? { backgroundColor: '#ffffff', color: '#171717' }
                  : { backgroundColor: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.75)' }
              }
              title={p.file_name}
            >
              {i + 1}
            </button>
          ))}
        </div>
      )}
    </div>
  );

  return createPortal(overlay, document.body);
}
