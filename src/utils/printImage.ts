/**
 * Print a single image (proof, cut/print chat photo, etc.) in a dedicated window.
 */
export function printImageBlob(blob: Blob, title: string): void {
  const url = URL.createObjectURL(blob);
  const win = window.open('', '_blank', 'width=900,height=1100');
  if (!win) {
    URL.revokeObjectURL(url);
    return;
  }

  const esc = (s: string) =>
    s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  win.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${esc(title || 'Print image')}</title>
  <style>
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #fff; }
    body { display: flex; align-items: center; justify-content: center; min-height: 100vh; }
    img { max-width: 100%; max-height: 100vh; object-fit: contain; }
    @media print {
      html, body { height: auto; }
      img { max-height: 100%; page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  <img src="${url}" alt="${esc(title)}" onload="window.print()" />
</body>
</html>`);
  win.document.close();
  win.addEventListener('afterprint', () => {
    URL.revokeObjectURL(url);
    win.close();
  });
}
