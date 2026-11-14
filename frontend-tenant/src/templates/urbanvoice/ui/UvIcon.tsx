interface UvIconProps {
  name: string;
  className?: string;
}

/** `<svg class="i"><use href="#o-…"/></svg>` como `ic()` de la demo. */
export function UvIcon({ name, className = 'i' }: UvIconProps) {
  return (
    <svg className={className}>
      <use href={`#o-${name}`} />
    </svg>
  );
}
