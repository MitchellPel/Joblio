import { boardColorText, sanitizeBoardColor } from '../utils/boardColor';

const bubbleBase =
  'w-fit min-w-0 max-w-full shrink truncate rounded-pill px-1.5 py-0.5 text-xs font-semibold sm:px-2 sm:text-sm';

export default function AssignedNameBubble({
  name,
  color,
  className = '',
}: {
  name: string | null | undefined;
  color?: string | null;
  className?: string;
}) {
  const label = name?.trim();
  if (!label) {
    return (
      <span className={`${bubbleBase} text-ink-40 ${className}`} title="Unassigned">
        Unassigned
      </span>
    );
  }
  const hex = sanitizeBoardColor(color);
  if (hex) {
    return (
      <span
        className={`${bubbleBase} ${className}`}
        style={{ backgroundColor: hex, color: boardColorText(hex) }}
        title={`Assigned to ${label}`}
      >
        {label}
      </span>
    );
  }
  return (
    <span className={`bg-brand/15 text-brand ${bubbleBase} ${className}`} title={`Assigned to ${label}`}>
      {label}
    </span>
  );
}
