/** Compact single-line job chip for month-calendar day cells. */

type Props = {
  client?: string | null;
  jobName?: string | null;
  jobNo?: string | null;
  weekend?: boolean;
  continued?: boolean;
  badge?: string;
};

export default function CalendarDayEvent({
  client,
  jobName,
  jobNo,
  weekend,
  continued,
  badge,
}: Props) {
  const clientTrim = client?.trim() || '';
  const nameTrim = jobName?.trim() || '';
  const noTrim = jobNo?.trim() || '';
  const label = [noTrim, nameTrim].filter(Boolean).join(' · ') || clientTrim || '—';
  const title = [noTrim, nameTrim, clientTrim].filter(Boolean).join(' — ') || label;

  return (
    <div
      className={`${weekend ? 'jt-cal-event jt-cal-event-weekend' : 'jt-cal-event'} ${
        continued ? 'opacity-80' : ''
      }`}
      title={title}
    >
      <span className="jt-cal-event-label">
        {continued ? '↳ ' : ''}
        {label}
        {badge ? ` · ${badge}` : ''}
      </span>
    </div>
  );
}

/** How many full chips to show before “+N more”. */
export const CAL_DAY_EVENT_VISIBLE = 3;
