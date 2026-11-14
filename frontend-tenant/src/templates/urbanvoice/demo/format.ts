/** Utilidades de formato y fechas — puerto de shared/core.js. */

export const MES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export const MES_S = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

const d0 = (d: Date): Date => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
export const TODAY = d0(new Date());

export const iso = (d: Date): string => {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};

export const pd = (s: string | null): Date | null => {
  if (!s) return null;
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};

export const addD = (d: Date, n: number): Date => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

export const addM = (d: Date, n: number): Date => {
  const x = new Date(d);
  const day = x.getDate();
  x.setDate(1);
  x.setMonth(x.getMonth() + n);
  x.setDate(Math.min(day, new Date(x.getFullYear(), x.getMonth() + 1, 0).getDate()));
  return x;
};

export const diff = (a: Date, b: Date): number => Math.round((d0(a).getTime() - d0(b).getTime()) / 864e5);

const num = (n: number): string => (+n || 0).toLocaleString('es-AR');
export const money = (n: number): string => `$${Math.round(+n || 0).toLocaleString('es-AR')}`;
export const nS = (n: number): string => `${num(n)} ${+n === 1 ? 'vecino' : 'vecinos'}`;

export const fD = (s: string | Date | null): string => {
  const d = typeof s === 'string' ? pd(s) : s;
  return d ? `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}` : '—';
};

export const fDs = (s: string | Date | null): string => {
  const d = typeof s === 'string' ? pd(s) : s;
  return d ? `${d.getDate()} ${MES_S[d.getMonth()].toLowerCase()}` : '—';
};

export const rel = (s: string | Date): string => {
  const d = typeof s === 'string' ? pd(s) : s;
  if (!d) return '—';
  const n = diff(d, TODAY);
  return n === 0 ? 'hoy' : n === 1 ? 'mañana' : n === -1 ? 'ayer' : n > 0 ? `en ${n} días` : `hace ${-n} días`;
};

export const relTs = (ts: number): string => {
  const m = Math.round((Date.now() - ts) / 6e4);
  return m < 1 ? 'recién' : m < 60 ? `hace ${m} min` : m < 1440 ? `hace ${Math.round(m / 60)} h` : rel(iso(new Date(ts)));
};

export const norm = (s: unknown): string =>
  String(s).toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');

export const hsh = (s: string): number => [...String(s)].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7);

export const initials = (name: string): string =>
  String(name || 'C')
    .split(/\s+/)
    .filter((w) => w.length > 2 || /^[A-ZÁÉÍÓÚ]/.test(w))
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase() || 'C';

export const waLink = (phone: string, text: string): string => {
  const digits = String(phone).replace(/\D/g, '');
  const full = digits.startsWith('54') ? digits : `549${digits.replace(/^0/, '')}`;
  return `https://wa.me/${full}?text=${encodeURIComponent(text)}`;
};
