import React from 'react';

interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  titleClassName?: string;
  descriptionClassName?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
  titleClassName = 'text-gray-900 text-lg',
  descriptionClassName = 'text-gray-400 text-sm',
}) => {
  return (
    <div className="py-12 text-center">
      <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
        {icon}
      </div>
      <p className={`font-medium ${titleClassName}`}>{title}</p>
      {description && <p className={`mt-1 ${descriptionClassName}`}>{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
};
