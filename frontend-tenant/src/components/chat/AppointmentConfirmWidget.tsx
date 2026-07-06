import type { AppointmentConfirmWidget as AppointmentConfirmWidgetData } from '../../types/chat.types';

interface Props {
  widget: AppointmentConfirmWidgetData;
  onConfirm: () => void;
  onDecline: () => void;
}

export function AppointmentConfirmWidget({ widget, onConfirm, onDecline }: Props) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-3 w-full max-w-[320px] shadow-sm">
      <p className="text-sm text-gray-800 mb-3">
        <span className="font-semibold">{widget.slot.label_day}</span> a las{' '}
        <span className="font-semibold">{widget.slot.label}</span>
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onConfirm}
          className="flex-1 px-3 py-1.5 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
        >
          Sí, confirmar
        </button>
        <button
          type="button"
          onClick={onDecline}
          className="flex-1 px-3 py-1.5 rounded-lg text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
        >
          No, elegir otro
        </button>
      </div>
    </div>
  );
}

export default AppointmentConfirmWidget;
