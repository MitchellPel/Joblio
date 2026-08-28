import * as fs from 'node:fs';
import { URL, pathToFileURL } from 'node:url';
import { ElectronHttpExecutor } from 'electron-updater/out/electronHttpExecutor';

/** Convert a file:// URL to a Windows local/UNC path. */
export function fileUrlToWindowsPath(url: URL): string {
  const decodedPath = decodeURIComponent(url.pathname);
  if (process.platform === 'win32') {
    // pathToFileURL('\\\\server\\share\\file') → file://server/share/file (hostname = server)
    if (url.hostname) {
      return `\\\\${url.hostname}${decodedPath.replace(/\//g, '\\')}`;
    }
    let p = decodedPath.replace(/^\/+/, '');
    if (/^[A-Za-z]:/.test(p)) {
      return p.replace(/\//g, '\\');
    }
    return `\\\\${p.replace(/\//g, '\\')}`;
  }
  return decodedPath;
}

interface FileDownloadOptions {
  sha512?: string;
  onProgress?: (progress: {
    total: number;
    delta: number;
    transferred: number;
    percent: number;
    bytesPerSecond: number;
  }) => void;
}

/**
 * HttpExecutor that copies from file:// / UNC paths via Node fs
 * (Chromium net.request cannot read network shares).
 */
export class FsShareHttpExecutor extends ElectronHttpExecutor {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  override async download(url: URL, destination: string, options: any): Promise<string> {
    if (url.protocol === 'file:') {
      const source = fileUrlToWindowsPath(url);
      console.log('[updater] Download from share:', source, '→', destination);
      await copyWithProgress(source, destination, options as FileDownloadOptions);
      return destination;
    }
    return super.download(url, destination, options);
  }
}

async function copyWithProgress(
  source: string,
  destination: string,
  options: FileDownloadOptions,
): Promise<void> {
  if (!fs.existsSync(source)) {
    throw new Error(`Update file not found: ${source}`);
  }

  const stat = fs.statSync(source);
  const total = stat.size;
  let transferred = 0;
  let lastEmit = 0;

  const emitProgress = () => {
    const now = Date.now();
    if (now - lastEmit < 100 && transferred < total) return;
    lastEmit = now;
    options.onProgress?.({
      total,
      delta: 0,
      transferred,
      percent: total > 0 ? (transferred / total) * 100 : 0,
      bytesPerSecond: 0,
    });
  };

  await new Promise<void>((resolve, reject) => {
    const readStream = fs.createReadStream(source);
    const writeStream = fs.createWriteStream(destination);

    readStream.on('data', (chunk: Buffer | string) => {
      transferred += typeof chunk === 'string' ? Buffer.byteLength(chunk) : chunk.length;
      emitProgress();
    });

    writeStream.on('finish', () => {
      options.onProgress?.({
        total,
        delta: 0,
        transferred: total,
        percent: 100,
        bytesPerSecond: 0,
      });
      resolve();
    });

    writeStream.on('error', reject);
    readStream.on('error', reject);
    readStream.pipe(writeStream);
  });

  if (options.sha512) {
    const crypto = await import('node:crypto');
    const hash = crypto.createHash('sha512');
    await new Promise<void>((resolve, reject) => {
      const rs = fs.createReadStream(destination);
      rs.on('data', (c) => hash.update(c));
      rs.on('end', () => {
        const actual = hash.digest('base64');
        if (actual !== options.sha512) {
          reject(new Error('Downloaded file checksum mismatch.'));
          return;
        }
        resolve();
      });
      rs.on('error', reject);
    });
  }
}

export { pathToFileURL };
