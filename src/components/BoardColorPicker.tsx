import { BOARD_COLOR_PRESETS, sanitizeBoardColor } from '../utils/boardColor';
import AssignedNameBubble from './AssignedNameBubble';

function colorInputValue(hex: string | null): string {
  return (hex || '#2563EB').toLowerCase();
}

export default function BoardColorPicker({
  value,
  onChange,
  previewName,
}: {
  value: string | null;
  onChange: (next: string | null) => void;
  previewName?: string;
}) {
  const hex = sanitizeBoardColor(value);

  function pick(next: string | null) {
    onChange(next);
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5">
        {BOARD_COLOR_PRESETS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              pick(c);
            }}
            className={`h-7 w-7 shrink-0 rounded-full border-2 ${
              hex === c ? 'border-ink ring-2 ring-ink/20' : 'border-transparent hover:border-ink-10'
            }`}
            style={{ backgroundColor: c }}
            title={c}
            aria-label={`Colour ${c}`}
            aria-pressed={hex === c}
          />
        ))}
        <label
          className="relative h-7 w-7 shrink-0 cursor-pointer overflow-hidden rounded-full border border-ink-10"
          title="Custom colour"
        >
          <input
            type="color"
            value={colorInputValue(hex)}
            onChange={(e) => {
              const next = sanitizeBoardColor(e.target.value);
              if (next) pick(next);
            }}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
          <span
            className="pointer-events-none block h-full w-full"
            style={{ backgroundColor: hex || '#2563EB' }}
          />
        </label>
        {hex && (
          <button
            type="button"
            className="text-[11px] text-ink-40 underline-offset-2 hover:text-ink hover:underline"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              pick(null);
            }}
          >
            Default
          </button>
        )}
      </div>
      {previewName?.trim() ? (
        <div className="mt-2.5">
          <AssignedNameBubble name={previewName} color={hex} />
        </div>
      ) : null}
      <p className="mt-1 text-xs text-ink-40">Shows as a colour bubble around this name on the board.</p>
    </div>
  );
}
