const HIC: Record<string, string> = {
  '📅': '<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  '📣': '<path d="M3 10v4h3l6 4V6L6 10z"/><path d="M16 9a4 4 0 0 1 0 6M19 6a8 8 0 0 1 0 12"/>',
  '📊': '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
};

interface LineIconProps {
  emoji: string;
  size?: number;
}

/** `lineIc()` de la demo: SVG para los emojis mapeados; el texto tal cual si no hay glifo. */
export function LineIcon({ emoji, size = 14 }: LineIconProps) {
  const d = HIC[emoji];
  if (!d) return <span aria-hidden="true">{emoji}</span>;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <g dangerouslySetInnerHTML={{ __html: d }} />
    </svg>
  );
}
