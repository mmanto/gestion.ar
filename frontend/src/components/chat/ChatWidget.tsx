import { lazy, Suspense, Component, type ReactNode } from 'react';
import type { AppointmentWidget } from '../../types/chat.types';

// Servidos por devbout-appointments vía Module Federation — ver ADR-009,
// docs/dev/DECISIONS.md. El contrato de props vive en
// ../../types/federation-remotes.d.ts.
const AppointmentCalendarWidget = lazy(() => import('appointments/AppointmentCalendarWidget'));
const AppointmentTimesWidget = lazy(() => import('appointments/AppointmentTimesWidget'));
const AppointmentConfirmWidget = lazy(() => import('appointments/AppointmentConfirmWidget'));

// React.lazy no tenía antes ningún punto de falla real (todo bundleado) —
// un chunk que no baja (red, ad-blocker) ahora puede tirar el render.
// Boundary acotado solo al widget, no a todo el chat.
class WidgetErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

interface ChatWidgetProps {
  widget: AppointmentWidget;
  onSelectDay: (dateISO: string) => void;
  onSelectTime: (startAtISO: string) => void;
  onBack: () => void;
  onConfirm: () => void;
  onDecline: () => void;
}

export function ChatWidget({ widget, onSelectDay, onSelectTime, onBack, onConfirm, onDecline }: ChatWidgetProps) {
  return (
    <WidgetErrorBoundary>
      <Suspense fallback={<div className="h-24 rounded-xl bg-gray-100 animate-pulse" />}>
        {widget.widget_type === 'appointment_calendar' && (
          <AppointmentCalendarWidget widget={widget} onSelectDay={onSelectDay} />
        )}
        {widget.widget_type === 'appointment_times' && (
          <AppointmentTimesWidget widget={widget} onSelectTime={onSelectTime} onBack={onBack} />
        )}
        {widget.widget_type === 'appointment_confirm' && (
          <AppointmentConfirmWidget widget={widget} onConfirm={onConfirm} onDecline={onDecline} />
        )}
      </Suspense>
    </WidgetErrorBoundary>
  );
}
