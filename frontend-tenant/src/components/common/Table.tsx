import React from 'react';

interface TableProps {
  children: React.ReactNode;
  className?: string;
}

export const Table: React.FC<TableProps> = ({ children, className = '' }) => (
  <div className={`overflow-x-auto bg-white rounded-lg border border-gray-300 shadow-sm ${className}`}>
    <table className="min-w-full divide-y divide-gray-200">{children}</table>
  </div>
);

export const TableHead: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <thead className="bg-gray-50">{children}</thead>
);

export const TableBody: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <tbody className="bg-white divide-y divide-gray-200">{children}</tbody>
);

interface TableRowProps extends React.HTMLAttributes<HTMLTableRowElement> {
  children: React.ReactNode;
}

export const TableRow: React.FC<TableRowProps> = ({ children, className = '', ...props }) => (
  <tr className={`hover:bg-gray-50 transition-colors ${className}`} {...props}>
    {children}
  </tr>
);

interface TableCellProps {
  children?: React.ReactNode;
  className?: string;
  align?: 'left' | 'right';
  /** Color de texto del <td> — prop separada de className para que el override no compita por especificidad con el default */
  textClassName?: string;
}

const alignStyles: Record<'left' | 'right', string> = {
  left: 'text-left',
  right: 'text-right',
};

export const TableHeaderCell: React.FC<TableCellProps> = ({ children, className = '', align = 'left' }) => (
  <th
    className={`px-6 py-3 ${alignStyles[align]} text-base font-medium text-gray-800 uppercase tracking-wider ${className}`}
  >
    {children}
  </th>
);

export const TableCell: React.FC<TableCellProps> = ({
  children,
  className = '',
  align = 'left',
  textClassName = 'text-gray-900',
}) => (
  <td className={`px-6 py-4 whitespace-nowrap text-base ${textClassName} ${alignStyles[align]} ${className}`}>
    {children}
  </td>
);
