import { lazy, Component, type ComponentType, type ReactNode } from 'react';
import type { AppointmentWidget } from '../types/chat.types';

/**
 * Registry de widgets de chat: `widget_type` (el que manda el backend en el
 * metadata del mensaje) → componente que lo renderiza. Los componentes de
 * `appointments` los sirve devbout-appointments vía Module Federation — ver
 * ADR-009, docs/dev/DECISIONS.md. El contrato de props vive en
 * ../types/federation-remotes.d.ts.
 *
 * Un módulo que aporte widgets de chat sólo tiene que sumar sus entradas acá
 * (y declarar sus `widget_types` en su manifiesto del backend, que es lo que
 * anuncia el módulo).
 */
export interface ChatWidgetHandlers {
  onSelectDay: (dateISO: string) => void;
  onSelectTime: (startAtISO: string) => void;
  onSelectOption: (value: string) => void;
  onBack: () => void;
  onConfirm: () => void;
  onDecline: () => void;
}

export interface ChatWidgetProps extends ChatWidgetHandlers {
  widget: AppointmentWidget;
}

export type ChatWidgetComponent = ComponentType<ChatWidgetProps>;

// El host pasa TODOS los handlers y el widget completo; cada remote declara
// (y consume) sólo los suyos, así que el cast es seguro: el `widget_type` es lo
// que garantiza que el widget y el componente se corresponden.
const asChatWidget = (component: unknown) => component as ChatWidgetComponent;

export const CHAT_WIDGETS: Record<string, ChatWidgetComponent> = {
  appointment_options: asChatWidget(lazy(() => import('appointments/AppointmentOptionsWidget'))),
  appointment_calendar: asChatWidget(lazy(() => import('appointments/AppointmentCalendarWidget'))),
  appointment_times: asChatWidget(lazy(() => import('appointments/AppointmentTimesWidget'))),
  appointment_confirm: asChatWidget(lazy(() => import('appointments/AppointmentConfirmWidget'))),
};

// React.lazy no tenía antes ningún punto de falla real (todo bundleado) — un
// chunk que no baja (red, ad-blocker) ahora puede tirar el render. Boundary
// acotado solo al widget, no a todo el chat.
export class WidgetErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}
