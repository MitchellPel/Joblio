/** Decode base64 from Electron IPC into bytes for Blobs / object URLs. */
export function bytesFromBase64(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    const slice = bytes.subarray(i, i + chunk);
    binary += String.fromCharCode.apply(null, slice as unknown as number[]);
  }
  return btoa(binary);
}

/**
 * Shrink camera photos in the renderer before IPC upload so designers don't
 * freeze the app shoving multi‑MB originals across the process boundary.
 */
export async function compressImageForUpload(
  file: File,
  maxEdge = 1600,
  quality = 0.78
): Promise<{ bytes: Uint8Array; mime_type: string; file_name: string; size: number }> {
  try {
    const bitmap = await createImageBitmap(file);
    const edge = Math.max(bitmap.width, bitmap.height);
    const scale = edge > maxEdge ? maxEdge / edge : 1;
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bitmap.close();
      throw new Error('No canvas');
    }
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();

    const blob: Blob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('encode failed'))),
        'image/jpeg',
        quality
      );
    });

    const buf = new Uint8Array(await blob.arrayBuffer());
    // Keep original if somehow smaller (rare for PNG screenshots)
    if (buf.length >= file.size && scale >= 1 && file.type === 'image/jpeg') {
      const raw = new Uint8Array(await file.arrayBuffer());
      return {
        bytes: raw,
        mime_type: file.type,
        file_name: file.name,
        size: raw.length,
      };
    }

    const base = file.name.replace(/\.[^.]+$/, '') || 'proof';
    return {
      bytes: buf,
      mime_type: 'image/jpeg',
      file_name: `${base}.jpg`,
      size: buf.length,
    };
  } catch {
    const raw = new Uint8Array(await file.arrayBuffer());
    return {
      bytes: raw,
      mime_type: file.type || 'image/jpeg',
      file_name: file.name,
      size: raw.length,
    };
  }
}

/** Limit how many heavy proof IPC calls run at once (stops lock/timeout storms). */
export function createAsyncQueue(concurrency = 2) {
  let active = 0;
  const waiting: Array<() => void> = [];

  async function run<T>(fn: () => Promise<T>): Promise<T> {
    if (active >= concurrency) {
      await new Promise<void>((resolve) => waiting.push(resolve));
    }
    active++;
    try {
      return await fn();
    } finally {
      active--;
      const next = waiting.shift();
      if (next) next();
    }
  }

  return { run };
}
