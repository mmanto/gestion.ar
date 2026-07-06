import { useMemo, useState } from 'react';
import { eachDayOfInterval, endOfMonth, format, getDay, parseISO, startOfMonth } from 'date-fns';
import { es } from 'date-fns/locale';
import type { AppointmentCalendarWidget as AppointmentCalendarWidgetData } from '../../types/chat.types';

const WEEKDAY_HEADERS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

interface Props {
  widget: AppointmentCalendarWidgetData;
  onSelectDay: (dateISO: string) => void;
}

function monthKey(date: Date): string {
  return format(date, 'yyyy-MM');
}

export function AppointmentCalendarWidget({ widget, onSelectDay }: Props) {
  const today = useMemo(() => parseISO(widget.today), [widget.today]);
  const minMonth = useMemo(() => startOfMonth(parseISO(widget.date_from)), [widget.date_from]);
  const maxMonth = useMemo(() => startOfMonth(parseISO(widget.date_to)), [widget.date_to]);
  const enabledDays = useMemo(() => new Set(widget.days), [widget.days]);

  const [viewMonth, setViewMonth] = useState(() => startOfMonth(today));

  const monthStart = startOfMonth(viewMonth);
  const monthEnd = endOfMonth(viewMonth);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });
  // date-fns getDay: 0=domingo..6=sábado. Queremos la semana empezando en lunes.
  const leadingBlanks = (getDay(monthStart) + 6) % 7;

  const canGoPrev = monthKey(monthStart) > monthKey(minMonth);
  const canGoNext = monthKey(monthStart) < monthKey(maxMonth);

  const monthLabel = format(viewMonth, 'MMMM yyyy', { locale: es });
  const capitalizedLabel = monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1);

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-3 w-full max-w-[320px] shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <button
          type="button"
          onClick={() => setViewMonth((m) => startOfMonth(new Date(m.getFullYear(), m.getMonth() - 1, 1)))}
          disabled={!canGoPrev}
          className="w-7 h-7 flex items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-transparent"
          aria-label="Mes anterior"
        >
          ‹
        </button>
        <span className="text-sm font-semibold text-gray-800">{capitalizedLabel}</span>
        <button
          type="button"
          onClick={() => setViewMonth((m) => startOfMonth(new Date(m.getFullYear(), m.getMonth() + 1, 1)))}
          disabled={!canGoNext}
          className="w-7 h-7 flex items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-transparent"
          aria-label="Mes siguiente"
        >
          ›
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 mb-1">
        {WEEKDAY_HEADERS.map((label, idx) => (
          <div key={idx} className="text-center text-xs font-medium text-gray-400 py-1">
            {label}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: leadingBlanks }).map((_, idx) => (
          <div key={`blank-${idx}`} />
        ))}
        {daysInMonth.map((day) => {
          const dateISO = format(day, 'yyyy-MM-dd');
          const isEnabled = enabledDays.has(dateISO);
          const isPast = dateISO < widget.today;

          return (
            <button
              key={dateISO}
              type="button"
              disabled={!isEnabled}
              onClick={() => isEnabled && onSelectDay(dateISO)}
              className={`aspect-square rounded-full text-sm flex items-center justify-center transition-colors ${
                isEnabled
                  ? 'bg-indigo-600 text-white font-medium hover:bg-indigo-700 cursor-pointer'
                  : isPast
                    ? 'text-gray-200 cursor-default'
                    : 'text-gray-300 cursor-default'
              }`}
            >
              {format(day, 'd')}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default AppointmentCalendarWidget;
