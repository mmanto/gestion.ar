import React, { useId } from 'react';
import { Input as InputControl } from '../ui/input';

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  fullWidth?: boolean;
}

/**
 * Envoltorio de formulario de gestion.ar: conserva la API histórica
 * (`label`/`error`/`helperText`/`fullWidth`) y delega el control en la
 * primitiva `components/ui/input` portada de devbout-ui/base.
 */
export const Input: React.FC<InputProps> = ({
  label,
  error,
  helperText,
  fullWidth = false,
  className,
  id,
  ...props
}) => {
  const generatedId = useId();
  const inputId = id || generatedId;

  return (
    <div className={fullWidth ? 'w-full' : undefined}>
      {label && (
        <label
          htmlFor={inputId}
          className="block text-xs font-medium text-foreground mb-1"
        >
          {label}
        </label>
      )}
      <InputControl
        id={inputId}
        aria-invalid={error ? true : undefined}
        className={className}
        {...props}
      />
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
      {helperText && !error && (
        <p className="mt-1 text-xs text-muted-foreground">{helperText}</p>
      )}
    </div>
  );
};
