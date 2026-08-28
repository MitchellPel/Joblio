import type { SVGProps } from 'react';

/**
 * Wall-mounted framed sign board (front view).
 * Same idea as the sketch: left mounts + double frame + SIGN.
 */
export default function SignJobIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      {/* Mounts */}
      <rect x="2.2" y="7.1" width="2.3" height="2.3" rx="0.35" fill="currentColor" stroke="none" />
      <rect x="2.2" y="14.6" width="2.3" height="2.3" rx="0.35" fill="currentColor" stroke="none" />
      {/* Outer frame */}
      <rect x="4.4" y="4.2" width="16.6" height="15.6" rx="1.6" />
      {/* Inner frame */}
      <rect x="6.35" y="6.15" width="12.7" height="11.7" rx="0.85" />
      {/* SIGN */}
      <text
        x="12.7"
        y="13.05"
        textAnchor="middle"
        dominantBaseline="central"
        fill="currentColor"
        stroke="none"
        fontSize="5.2"
        fontWeight="800"
        fontFamily="Segoe UI, Arial, sans-serif"
        letterSpacing="0.35"
      >
        SIGN
      </text>
    </svg>
  );
}
