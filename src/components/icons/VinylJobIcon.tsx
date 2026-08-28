import type { SVGProps } from 'react';

/** Vinyl decal with a peeling corner. */
export default function VinylJobIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      {/* Sheet */}
      <path d="M5 4.5h10.5a1.8 1.8 0 0 1 1.8 1.8v8.2c0 .4-.1.7-.4 1L13 19.4a1.4 1.4 0 0 1-1 .4H5A1.8 1.8 0 0 1 3.2 18V6.3A1.8 1.8 0 0 1 5 4.5z" />
      {/* Fold */}
      <path d="M12 19.8V14.6c0-.9.7-1.6 1.6-1.6h5.1" />
      {/* Curl / peel */}
      <path d="M18.7 13c1.2.4 2.3 1.8 2.5 3.3-1.1.6-2.6.8-3.9.3-.2-1.3.3-2.8 1.4-3.6z" />
      {/* Face mark */}
      <circle cx="10" cy="10.2" r="2.4" />
      <path d="M10 8.4v3.6M8.2 10.2h3.6" strokeWidth="1.35" />
    </svg>
  );
}
