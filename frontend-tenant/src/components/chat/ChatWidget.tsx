import { Suspense } from 'react';
import type { AppointmentWidget } from '../../types/chat.types';
import { CHAT_WIDGETS, WidgetErrorBoundary, type ChatWidgetHandlers } from '../../modules/chatWidgets';

// Los widgets disponibles salen del registry (../../modules/chatWidgets) en vez
// de estar hardcodeados acá: un módulo que aporte widgets de chat sólo tiene
// que registrarlos ahí (y anunciar sus widget_types en su manifiesto del
// backend).

export type ChatWidgetProps = { widget: AppointmentWidget } & ChatWidgetHandlers;

export function ChatWidget({ widget, ...handlers }: ChatWidgetProps) {
  const Widget = CHAT_WIDGETS[widget.widget_type];
  if (!Widget) return null;

  return (
    <WidgetErrorBoundary>
      <Suspense fallback={<div className="h-24 rounded-xl bg-gray-100 animate-pulse" />}>
        <Widget widget={widget} {...handlers} />
      </Suspense>
    </WidgetErrorBoundary>
  );
}
