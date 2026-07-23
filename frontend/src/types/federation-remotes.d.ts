// Tipos ambient para los módulos expuestos vía Module Federation por
// devbout-appointments/frontend-widgets (ver ADR-009, docs/dev/DECISIONS.md).
// El plugin @module-federation/vite puede autogenerar estos .d.ts desde el
// remote, pero esa generación falla hoy (TYPE-001) — se declaran a mano
// mientras tanto. El contrato debe mantenerse en sync manualmente con
// devbout-appointments/frontend-widgets/src/chat/*.tsx.

declare module 'appointments/AppointmentCalendarWidget' {
  import type { ReactElement } from 'react';
  import type { AppointmentCalendarWidget } from './chat.types';

  interface Props {
    widget: AppointmentCalendarWidget;
    onSelectDay: (dateISO: string) => void;
  }

  const AppointmentCalendarWidgetComponent: (props: Props) => ReactElement;
  export default AppointmentCalendarWidgetComponent;
}

declare module 'appointments/AppointmentTimesWidget' {
  import type { ReactElement } from 'react';
  import type { AppointmentTimesWidget } from './chat.types';

  interface Props {
    widget: AppointmentTimesWidget;
    onSelectTime: (startAtISO: string) => void;
    onBack: () => void;
  }

  const AppointmentTimesWidgetComponent: (props: Props) => ReactElement;
  export default AppointmentTimesWidgetComponent;
}

declare module 'appointments/AppointmentConfirmWidget' {
  import type { ReactElement } from 'react';
  import type { AppointmentConfirmWidget } from './chat.types';

  interface Props {
    widget: AppointmentConfirmWidget;
    onConfirm: () => void;
    onDecline: () => void;
  }

  const AppointmentConfirmWidgetComponent: (props: Props) => ReactElement;
  export default AppointmentConfirmWidgetComponent;
}

declare module 'appointments/AppointmentsWorkspace' {
  import type { ReactElement, ComponentType } from 'react';
  import type { AxiosInstance } from 'axios';
  import type { BotModuleInfo } from './tenant.types';
  import type { InputProps } from '../components/common/Input';
  import type { ButtonProps } from '../components/common/Button';
  import type { CardProps } from '../components/common/Card';

  interface Props {
    botId: string;
    moduleInfo: BotModuleInfo;
    apiClient: AxiosInstance;
    ui: {
      Input: ComponentType<InputProps>;
      Button: ComponentType<ButtonProps>;
      Card: ComponentType<CardProps>;
    };
    accent: string;
  }

  const AppointmentsWorkspaceComponent: (props: Props) => ReactElement;
  export default AppointmentsWorkspaceComponent;
}
