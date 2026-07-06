import React from 'react';
import { useTemplate } from '../../hooks/useTemplate';
import { TEMPLATE_MAP } from '../../templates/registry';

interface AppLayoutProps {
  children: React.ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const { templateId } = useTemplate();
  const Template = TEMPLATE_MAP[templateId].AppLayout;
  return <Template>{children}</Template>;
}
