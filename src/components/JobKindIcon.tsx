import type { ComponentType, SVGProps } from 'react';
import { Truck } from 'lucide-react';
import type { JobKind } from '@/shared-types';
import SignJobIcon from './icons/SignJobIcon';
import VinylJobIcon from './icons/VinylJobIcon';

type IconComp = ComponentType<SVGProps<SVGSVGElement> & { className?: string }>;

export const JOB_KIND_OPTIONS: {
  key: JobKind;
  label: string;
  hint: string;
  Icon: IconComp;
  className: string;
}[] = [
  {
    key: 'vehicle',
    label: 'Vehicle',
    hint: 'Van / truck work',
    Icon: Truck as IconComp,
    className: 'text-stage-design',
  },
  {
    key: 'sign',
    label: 'Sign',
    hint: 'Box / fascia signs',
    Icon: SignJobIcon,
    className: 'text-stage-install',
  },
  {
    key: 'vinyl',
    label: 'Vinyl',
    hint: 'Decals & wraps',
    Icon: VinylJobIcon,
    className: 'text-stage-production',
  },
];

const KIND_META = Object.fromEntries(
  JOB_KIND_OPTIONS.map((o) => [o.key, o])
) as Record<JobKind, (typeof JOB_KIND_OPTIONS)[number]>;

export function isJobKind(value: unknown): value is JobKind {
  return value === 'vehicle' || value === 'sign' || value === 'vinyl';
}

export function jobKindLabel(kind: JobKind | null | undefined): string | null {
  if (!kind) return null;
  return KIND_META[kind]?.label ?? null;
}

/** Small board-card / header icon for job type. */
export default function JobKindIcon({
  kind,
  size = 'sm',
}: {
  kind: JobKind | null | undefined;
  size?: 'sm' | 'md';
}) {
  if (!kind || !KIND_META[kind]) return null;
  const { label, Icon, className } = KIND_META[kind];
  const dim = size === 'md' ? 'h-4 w-4' : 'h-3.5 w-3.5';
  return (
    <span
      className={`inline-flex shrink-0 items-center ${className}`}
      title={label}
      aria-label={label}
    >
      <Icon className={dim} />
    </span>
  );
}
