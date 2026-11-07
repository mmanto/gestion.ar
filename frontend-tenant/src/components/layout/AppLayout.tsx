import React, { useLayoutEffect } from 'react';
import { useTemplate } from '../../hooks/useTemplate';
import { TEMPLATE_MAP } from '../../templates/registry';

interface AppLayoutProps {
  children: React.ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const { templateId } = useTemplate();
  const Template = TEMPLATE_MAP[templateId].AppLayout;

  // La escala tipográfica del backoffice vive en index.css (`:root.backoffice`)
  // y está activa sólo mientras se renderiza un layout privado: las rutas
  // públicas comparten el mismo index.css y no deben heredar el zoom.
  useLayoutEffect(() => {
    document.documentElement.classList.add('backoffice');
    return () => document.documentElement.classList.remove('backoffice');
  }, []);

  return <Template>{children}</Template>;
}
