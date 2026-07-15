import { useEffect, useState } from 'react';

// Mismo breakpoint `md` (768px) que ya usa el sidebar para su drawer mobile
// (ver Sidebar.tsx / templates/kero/Sidebar.tsx, ambos puramente CSS).
const MOBILE_QUERY = '(max-width: 767px)';

export const useIsMobile = (): boolean => {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(MOBILE_QUERY).matches
  );

  useEffect(() => {
    const mql = window.matchMedia(MOBILE_QUERY);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  return isMobile;
};
