import React from 'react';
import { useTemplate } from '../../hooks/useTemplate';

export const TemplatePicker: React.FC = () => {
  const { templateId, setTemplateId, templates } = useTemplate();

  return (
    <div className="px-4 py-2.5">
      <p className="text-xs text-gray-400 mb-1.5">Diseño</p>
      <div className="flex gap-1.5">
        {templates.map(t => (
          <button
            key={t.id}
            onClick={() => setTemplateId(t.id)}
            className={`flex-1 text-xs font-medium py-1.5 rounded-md border transition-colors ${
              templateId === t.id
                ? 'border-primary text-primary bg-primary-50'
                : 'border-gray-300 text-gray-700 hover:bg-gray-50'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
};
