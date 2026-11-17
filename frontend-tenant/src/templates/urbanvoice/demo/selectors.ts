/** Selectores y reglas de negocio de la demo — puerto de core.js, datos.js y clubes.js. */

import { MES, TODAY, addD, addM, diff, fD, iso, norm, nS, pd, rel } from './format';
import type {
  Club, ClubState, ClubStateKey, Health, HealthKey, Lead, LeadStatus, Liquidation, ListFilters, Partner, Pay, Pending, Plan, SetupKey, Task,
} from './types';

export const MODS: Record<string, [string, string]> = {
  comunicacion: ['Comunicación con vecinos', '📣'],
  eventos: ['Agenda de encuentros y eventos', '📅'],
  reportes: ['Reportes y métricas', '📊'],
  tienda: ['Informes avanzados', '📑'],
};
export const BASE_MODS = 'Gestión de vecinos, reclamos y sitio web del cliente';
export const TIPOS = ['Candidatura', 'Concejal', 'Referente barrial', 'Organización vecinal', 'Agrupación política', 'ONG', 'Otro'];
export const COLORS = ['#F9A30A', '#2563EB', '#0E9F6E', '#DC2626', '#7C3AED', '#0891B2', '#DB2777', '#65A30D', '#EA580C', '#4F46E5', '#0F766E', '#B45309'];

export const ST: Record<ClubStateKey, [string, string]> = {
  activo: ['Al día', 'ok'],
  pronto: ['Vence pronto', 'warn'],
  prueba: ['En prueba', 'info'],
  atrasado: ['Pago atrasado', 'bad'],
  suspendido: ['Suspendido', 'sus'],
  baja: ['Dado de baja', 'off'],
};

export const HL: Record<HealthKey, [string, string]> = {
  bien: ['Lo usa bien', 'ok'],
  poco: ['Poco uso', 'warn'],
  riesgo: ['Riesgo de baja', 'bad'],
  nuevo: ['Arrancando', 'info'],
  off: ['—', 'off'],
};

export const SETUP: Array<[SetupKey, string]> = [
  ['logo', 'Logo, colores y datos del cliente cargados'],
  ['padron', 'Zonas y barrios configurados'],
  ['cuotas', 'Categorías de reclamos configuradas'],
  ['firstPay', 'Primeros reclamos recibidos'],
  ['training', 'Equipo capacitado'],
  ['online', '50 vecinos usando el asistente'],
  ['domain', 'Dominio propio conectado (opcional)'],
];
export const SETUP_S: Record<SetupKey, string> = {
  logo: 'logo', padron: 'zonas', cuotas: 'categorías', firstPay: 'primeros reclamos',
  training: 'capacitación', online: 'vecinos activos', domain: 'dominio',
};
export const SETUP_REQ: SetupKey[] = SETUP.filter(([k]) => k !== 'domain').map(([k]) => k);

export const plan = (db: { plans: Plan[] }, id: string): Plan => db.plans.find((p) => p.id === id) || db.plans[0];
export const club = (db: { clubs: Club[] }, id: string): Club | undefined => db.clubs.find((c) => c.id === id);
export const clubPays = (db: { pays: Pay[] }, id: string): Pay[] => db.pays.filter((p) => p.club === id).sort((a, b) => b.date.localeCompare(a.date));
export const partnerOf = (db: { partners: Partner[] }, c: Club): Partner | null => db.partners.find((p) => p.id === c.partner) || null;

export function state(db: { cfg: { grace: number; autoSusp: boolean; soon: number } }, c: Club): ClubState {
  const C = db.cfg;
  const trial = !c.paidUntil;
  const due = pd(c.paidUntil || c.trialEnd);
  const left = due ? diff(due, TODAY) : 0;
  const cut = due ? addD(due, C.grace) : null;
  if (c.manual === 'baja') return { k: 'baja', due, cut, left, trial };
  if (c.manual === 'suspendido') return { k: 'suspendido', due, cut, left, trial, man: true };
  if (trial && left >= 0) return { k: 'prueba', due, cut, left, trial };
  if (left >= 0) return { k: left <= C.soon ? 'pronto' : 'activo', due, cut, left, trial };
  if (!C.autoSusp || -left <= C.grace) return { k: 'atrasado', due, cut, left, trial };
  return { k: 'suspendido', due, cut, left, trial };
}

const stepOf = (p: Plan): number => Math.max(1, +p.step || 100);
export function planPrice(p: Plan, socios: number): number {
  const n = Math.max(1, +socios || 1);
  const tr = Math.ceil(Math.max(0, n - (+p.incl || 0)) / stepOf(p));
  const v = (+p.base || 0) + tr * (+p.extra || 0);
  return +p.cap ? Math.min(+p.cap, v) : v;
}
export const planRule = (p: Plan): string =>
  `$${(+p.base || 0).toLocaleString('es-AR')} hasta ${nS(+p.incl || 0)}${+p.extra ? ` · +$${(+p.extra).toLocaleString('es-AR')} cada ${nS(stepOf(p))} más` : ''}${+p.cap ? ` · máximo $${(+p.cap).toLocaleString('es-AR')}` : ''}`;

export const specialOn = (c: Club): boolean => !!(c.special && c.special.type && (!c.special.until || pd(c.special.until)! >= TODAY));
export function clubPrice(db: { plans: Plan[] }, c: Club, planId?: string): number {
  const p = plan(db, planId || c.plan);
  const list = planPrice(p, c.socios);
  if (!planId && specialOn(c)) {
    return c.special!.type === 'pct' ? Math.round((list * (1 - (+c.special!.value || 0) / 100)) / 100) * 100 : +c.special!.value || 0;
  }
  return list;
}
export const discFor = (db: { cfg: { disc: Record<number, number> } }, m: number): number => +((db.cfg.disc || {})[m] || 0);
export const priceFor = (db: { plans: Plan[]; cfg: { disc: Record<number, number> } }, c: Club, m: number): number =>
  Math.round((clubPrice(db, c) * m * (1 - discFor(db, m) / 100)) / 100) * 100;

export const active = (db: { cfg: { grace: number; autoSusp: boolean; soon: number } }, c: Club): boolean => state(db, c).k !== 'baja';
export const paying = (db: { cfg: { grace: number; autoSusp: boolean; soon: number } }, c: Club): boolean =>
  ['activo', 'pronto', 'atrasado'].includes(state(db, c).k);
export const siteUrl = (db: { cfg: { domain: string } }, c: Club): string => `${c.slug}.${db.cfg.domain}`;
export const setupPct = (c: Club): number =>
  Math.round((SETUP_REQ.filter((k) => (c.setup || {})[k]).length / SETUP_REQ.length) * 100);
export const inSetup = (db: { cfg: { grace: number; autoSusp: boolean; soon: number } }, c: Club): boolean =>
  active(db, c) && setupPct(c) < 100;

export function health(db: { cfg: { grace: number; autoSusp: boolean; soon: number } }, c: Club): Health {
  if (!active(db, c)) return { k: 'off', days: 99 };
  const u = c.usage || { w: [], players: 0, last: null };
  const w = u.w || [];
  const last = u.last;
  const days = last ? diff(TODAY, pd(last)!) : 99;
  const avg = (a: number[]): number => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
  const rec = avg(w.slice(-2));
  const prev = avg(w.slice(-8, -2));
  const per100 = rec / Math.max(1, c.socios / 100);
  if (diff(TODAY, pd(c.created)!) < 21) return { k: 'nuevo', why: 'Recién empieza', days };
  if (days > 14) return { k: 'riesgo', why: `No entra al panel hace ${days} días`, days };
  if (prev > 0 && rec < prev * 0.5) return { k: 'riesgo', why: `Los movimientos bajaron ${Math.round((1 - rec / prev) * 100)}%`, days };
  if (days > 7) return { k: 'poco', why: `No entra al panel hace ${days} días`, days };
  if (per100 < 6) return { k: 'poco', why: `Poco movimiento: ${Math.round(per100)} por cada 100 vecinos por semana`, days };
  return { k: 'bien', why: `${Math.round(per100)} movimientos por cada 100 vecinos por semana`, days };
}

export const badgeMeta = (k: ClubStateKey): { label: string; tone: string } => ({ label: ST[k][0], tone: ST[k][1] });
export const healthMeta = (k: HealthKey): { label: string; tone: string } => ({ label: HL[k][0], tone: HL[k][1] });

export const counts = (db: { clubs: Club[]; plans: Plan[]; cfg: { grace: number; autoSusp: boolean; soon: number } }) => {
  const out = { all: db.clubs.length, activo: 0, pronto: 0, prueba: 0, atrasado: 0, suspendido: 0, baja: 0 };
  db.clubs.forEach((c) => { out[state(db, c).k]++; });
  return out;
};

const ORDER: Record<ClubStateKey, number> = { atrasado: 0, suspendido: 1, pronto: 2, prueba: 3, activo: 4, baja: 5 };
export function filterClubs(db: { clubs: Club[]; plans: Plan[]; partners: Partner[]; cfg: { grace: number; autoSusp: boolean; soon: number } }, f: ListFilters): Club[] {
  const q = norm(f.q.trim());
  return db.clubs
    .filter((c) =>
      (!f.st || state(db, c).k === f.st) &&
      (!f.plan || c.plan === f.plan) &&
      (!f.tipo || c.tipo === f.tipo) &&
      (!f.part || (partnerOf(db, c) || {}).id === f.part) &&
      (!q || norm(`${c.name} ${c.city} ${c.owner} ${c.prov} ${c.tipo || ''}`).includes(q))
    )
    .sort((a, b) => ORDER[state(db, a).k] - ORDER[state(db, b).k] || a.name.localeCompare(b.name));
}

export function searchClubs(db: { clubs: Club[] }, q: string, limit = 6): Club[] {
  const t = norm(q.trim());
  if (!t) return [];
  return db.clubs.filter((c) => norm(`${c.name} ${c.city} ${c.owner} ${c.slug}`).includes(t)).slice(0, limit);
}

const TONE: Record<Pending['tone'], number> = { bad: 0, warn: 1, info: 2, ok: 3 };
export function pendingAll(db: { clubs: Club[]; plans: Plan[]; cfg: { grace: number; autoSusp: boolean; soon: number } }): Pending[] {
  const out: Pending[] = [];
  db.clubs.forEach((c) => {
    const S = state(db, c);
    const H = health(db, c);
    if (S.k === 'atrasado') out.push({ clubId: c.id, text: `Abono vencido el ${fD(S.due)}`, tone: 'bad' });
    else if (S.k === 'suspendido') out.push({ clubId: c.id, text: S.man ? 'Suspendido a mano' : `Sin pago desde el ${fD(S.due)}`, tone: 'bad' });
    else if (S.k === 'prueba' && S.left <= db.cfg.soon) out.push({ clubId: c.id, text: `La prueba termina ${rel(iso(S.due!))}`, tone: 'info' });
    else if (S.k === 'pronto') out.push({ clubId: c.id, text: `El abono vence ${rel(iso(S.due!))}`, tone: 'warn' });
    if (inSetup(db, c)) out.push({ clubId: c.id, text: `Puesta en marcha al ${setupPct(c)}%`, tone: 'info' });
    if (H.k === 'riesgo') out.push({ clubId: c.id, text: H.why || 'Riesgo de baja', tone: 'bad' });
    else if (H.k === 'poco') out.push({ clubId: c.id, text: H.why || 'Poco uso', tone: 'warn' });
  });
  return out.sort((a, b) => TONE[a.tone] - TONE[b.tone]);
}

export const tasksOf = (db: { tasks: Task[] }, clubId: string): Task[] => db.tasks.filter((t) => t.club === clubId);

/* ---------- Partners (puerto de partners.js) ---------- */
type PartnerDb = {
  plans: Plan[];
  clubs: Club[];
  pays: Pay[];
  partners: Partner[];
  liq: Liquidation[];
  leads: Lead[];
  cfg: { grace: number; autoSusp: boolean; soon: number };
};

export const LS: Record<LeadStatus, [string, string]> = {
  nueva: ['Nueva', 'warn'],
  contactada: ['Contactada', 'info'],
  alta: ['Dada de alta', 'ok'],
  descartada: ['Descartada', 'off'],
};

export const partner = (db: { partners: Partner[] }, id: string): Partner | undefined => db.partners.find((p) => p.id === id);
export const pName = (db: { partners: Partner[] }, id: string): string => partner(db, id)?.name || '—';
export const mKey = (d: Date): string => iso(d).slice(0, 7);
export const partnerByCode = (db: { partners: Partner[] }, code?: string | null): Partner | null =>
  code ? db.partners.find((p) => p.active !== false && p.code === String(code).toLowerCase()) || null : null;

export const pClubs = (db: { clubs: Club[] }, pid: string): Club[] => db.clubs.filter((c) => c.partner === pid);
export const pClients = (db: { clubs: Club[] }, pid: string): number => pClubs(db, pid).length;
export const pActive = (db: PartnerDb, pid: string): number => pClubs(db, pid).filter((c) => active(db, c)).length;
export const pMrr = (db: PartnerDb, pid: string): number =>
  pClubs(db, pid).filter((c) => paying(db, c)).reduce((a, c) => a + clubPrice(db, c), 0);

/** Cobrado a los clientes del partner en un mes (`YYYY-MM`). */
export function pColl(db: { clubs: Club[]; pays: Pay[] }, pid: string, ym: string): number {
  const ids = new Set(pClubs(db, pid).map((c) => c.id));
  return db.pays.filter((x) => ids.has(x.club) && x.date.startsWith(ym)).reduce((a, x) => a + x.amount, 0);
}
export const pPct = (db: { partners: Partner[] }, pid: string): number => +((partner(db, pid) || {}).pct ?? 0) || 0;
export const pComm = (db: { partners: Partner[]; clubs: Club[]; pays: Pay[] }, pid: string, ym: string): number =>
  Math.round((pColl(db, pid, ym) * pPct(db, pid)) / 100);

/** Detalle de un mes: qué pagó cada cliente del partner. */
export function pDetail(db: { clubs: Club[]; pays: Pay[] }, pid: string, ym: string): Array<{ name: string; kind: string; amount: number; c: Club }> {
  const rows: Array<{ name: string; kind: string; amount: number; c: Club }> = [];
  pClubs(db, pid).forEach((c) => {
    const amount = db.pays.filter((x) => x.club === c.id && x.date.startsWith(ym)).reduce((s, x) => s + x.amount, 0);
    if (amount) rows.push({ name: c.name, kind: 'Cliente', amount, c });
  });
  return rows.sort((a, b) => b.amount - a.amount);
}

export const liqOf = (db: { liq: Liquidation[] }, pid: string, ym: string): Liquidation | undefined =>
  db.liq.find((x) => x.pid === pid && x.ym === ym);

/** Comisiones de los últimos 12 meses ya cerrados que todavía no se liquidaron. */
export function pDebt(db: PartnerDb, pid: string): number {
  let n = 0;
  for (let i = 1; i <= 12; i++) {
    const k = mKey(addM(TODAY, -i));
    if (!liqOf(db, pid, k)) n += pComm(db, pid, k);
  }
  return n;
}
export const pPaid = (db: { liq: Liquidation[] }, pid: string): number =>
  db.liq.filter((x) => x.pid === pid).reduce((a, x) => a + x.amount, 0);

export interface PartnerMonth { k: string; label: string; cur: boolean }
export function pMonths(n = 6): PartnerMonth[] {
  const rows: PartnerMonth[] = [];
  for (let i = 0; i < n; i++) {
    const d = addM(TODAY, -i);
    const label = `${MES[d.getMonth()][0].toUpperCase()}${MES[d.getMonth()].slice(1)} ${d.getFullYear()}`;
    rows.push({ k: mKey(d), label, cur: i === 0 });
  }
  return rows;
}
export const mLabel = (k: string): string => {
  const [y, m] = k.split('-');
  return `${MES[+m - 1][0].toUpperCase()}${MES[+m - 1].slice(1)} ${y}`;
};

/** Partner de una solicitud: el asignado a mano o el del link (`?p=código`). */
export const leadPartner = (db: { partners: Partner[] }, l: Lead): Partner | null =>
  (l.partner && partner(db, l.partner)) || partnerByCode(db, l.ref);
export const leadsOfPartner = (db: { partners: Partner[]; leads: Lead[] }, pid: string): Lead[] =>
  db.leads.filter((l) => leadPartner(db, l)?.id === pid);
export const unassignedLeads = (db: { partners: Partner[]; leads: Lead[] }): number =>
  db.leads.filter((l) => !leadPartner(db, l) && ['nueva', 'contactada'].includes(l.status)).length;

export const userName = (db: { users: Array<{ id: string; name: string }> }, userId: string, snapshot?: string): string =>
  snapshot || db.users.find((u) => u.id === userId)?.name || '—';
