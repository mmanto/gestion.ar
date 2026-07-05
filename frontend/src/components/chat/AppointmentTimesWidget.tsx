import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import type { AppointmentTimesWidget as AppointmentTimesWidgetData } from '../../types/chat.types';

interface Props {
  widget: AppointmentTimesWidgetData;
  onSelectTime: (startAtISO: string) => void;
  onBack: () => void;
}

export function AppointmentTimesWidget({ widget, onSelectTime, onBack }: Props) {
  const dateLabel = format(parseISO(widget.date), "EEEE d 'de' MMMM", { locale: es });
  const capitalizedLabel = dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1);

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-3 w-full max-w-[320px] shadow-sm">
      <p className="text-sm font-semibold text-gray-800 mb-2">{capitalizedLabel}</p>
      <div className="flex flex-wrap gap-2 mb-3">
        {widget.slots.map((slot) => (
          <button
            key={slot.start_at}
            type="button"
            onClick={() => onSelectTime(slot.start_at)}
            className="px-3 py-1.5 rounded-full text-sm font-medium bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-colors"
          >
            {slot.label}
          </button>
        ))}
      </div>
      <button type="button" onClick={onBack} className="text-xs text-gray-500 hover:text-gray-700">
        ‹ Volver al calendario
      </button>
    </div>
  );
}

export default AppointmentTimesWidget;
