import React from 'react';

interface TableProps {
  children: React.ReactNode;
  className?: string;
}

// Sin caja propia (ni bg-white/border/shadow): en esta app la Table siempre
// vive dentro de un panel que ya es blanco con sombra (page shell o Card
// shadow="none"), así que ese fondo+borde solo agregaba una caja repetida
// adentro de otra. El header teñido (TableHead) y los separadores entre
// filas (divide-y) ya alcanzan para leer la tabla sin el box extra.
export const Table: React.FC<TableProps> = ({ children, className = '' }) => (
  <div className={`overflow-x-auto ${className}`}>
    <table className="min-w-full divide-y divide-gray-200">{children}</table>
  </div>
);

export const TableHead: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <thead className="bg-white border-b border-gray-200">{children}</thead>
);

export const TableBody: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <tbody className="divide-y divide-gray-200">{children}</tbody>
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
  align?: 'left' | 'right' | 'center';
  /** Color de texto del <td> — prop separada de className para que el override no compita por especificidad con el default */
  textClassName?: string;
}

const alignStyles: Record<'left' | 'right' | 'center', string> = {
  left: 'text-left',
  right: 'text-right',
  center: 'text-center',
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
