import React from 'react';
import { cn } from '../../lib/utils';

interface TableProps {
  children: React.ReactNode;
  className?: string;
}

export const Table: React.FC<TableProps> = ({ children, className = '' }) => (
  <div className={cn('overflow-x-auto rounded-xl border border-border bg-card', className)}>
    <table className="w-full text-xs/relaxed">{children}</table>
  </div>
);

export const TableHead: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <thead className="bg-muted/50">{children}</thead>
);

export const TableBody: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <tbody className="bg-card">{children}</tbody>
);

interface TableRowProps extends React.HTMLAttributes<HTMLTableRowElement> {
  children: React.ReactNode;
}

export const TableRow: React.FC<TableRowProps> = ({ children, className = '', ...props }) => (
  <tr className={cn('hover:bg-muted/50 transition-colors', className)} {...props}>
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
    className={cn(
      'h-10 px-2 align-middle font-medium text-muted-foreground',
      alignStyles[align],
      className
    )}
  >
    {children}
  </th>
);

export const TableCell: React.FC<TableCellProps> = ({
  children,
  className = '',
  align = 'left',
  textClassName = 'text-foreground',
}) => (
  <td
    className={cn(
      'p-2 align-middle whitespace-nowrap',
      textClassName,
      alignStyles[align],
      className
    )}
  >
    {children}
  </td>
);
