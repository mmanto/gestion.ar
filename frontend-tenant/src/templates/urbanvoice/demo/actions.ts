/** Mutaciones de la demo — puerto de clubes.js, cobros.js y mensajes.js. */

import type { User } from '../../../types/auth.types';
import { TODAY, addM, iso } from './format';
import { COLORS, clubPrice, discFor, pName, plan, setupPct, state } from './selectors';
import type { Club, DemoDb, Liquidation, LogType, Partner, Pay, PlanId, SetupKey, SpecialPrice } from './types';

export interface Actor {
  id: string;
  name: string;
}

export function actorOf(user: User | null): Actor {
  return {
    id: user?.username ?? 'u1',
    name: [user?.nombre, user?.apellido].filter(Boolean).join(' ') || user?.username || 'Administrador',
  };
}

const ACT: Record<LogType, string> = {
  pay: 'Pago', baja: 'Baja', remind: 'Recordatorio', sus: 'Suspensión', react: 'Reactivación', plan: 'Plan', edit: 'Edición', new: 'Alta',
};

export function logAdd(db: DemoDb, clubId: string, type: LogType, text: string, actor: Actor): void {
  db.log.unshift({ at: iso(TODAY), ts: Date.now(), t: type, club: clubId, txt: text });
  db.log = db.log.slice(0, 80);
  db.audit.unshift({ ts: Date.now(), user: actor.id, userName: actor.name, action: ACT[type] ?? 'Cambio', detail: text, club: clubId });
  db.audit = db.audit.slice(0, 400);
}

export interface PaymentInput {
  months: number;
  amount: number;
  date: string;
  method: string;
  note: string;
}

export function registerPayment(db: DemoDb, clubId: string, input: PaymentInput, actor: Actor): Pay {
  const c = db.clubs.find((x) => x.id === clubId);
  if (!c) throw new Error('Cliente inexistente');
  const S = state(db, c);
  const from = S.trial ? (S.left >= 0 ? pdDate(c.trialEnd) : TODAY) : pdDate(c.paidUntil);
  const to = addM(from, input.months);
  const pay: Pay = {
    id: `p${Date.now()}`,
    n: db.nextN++,
    club: c.id,
    date: input.date,
    amount: input.amount,
    months: input.months,
    from: iso(from),
    to: iso(to),
    method: input.method,
    note: input.note,
    plan: plan(db, c.plan).name,
    socios: c.socios,
    disc: discFor(db, input.months),
  };
  db.pays.push(pay);
  c.paidUntil = iso(to);
  if (c.manual === 'suspendido') c.manual = null;
  logAdd(db, c.id, 'pay', `Pago recibido · ${moneyText(input.amount)}${input.months > 1 ? ` (${input.months} meses)` : ''}`, actor);
  return pay;
}

function pdDate(s: string | null): Date {
  if (!s) return TODAY;
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function moneyText(n: number): string {
  return `$${Math.round(+n || 0).toLocaleString('es-AR')}`;
}

export function voidPayment(db: DemoDb, payId: string, actor: Actor): void {
  const pay = db.pays.find((x) => x.id === payId);
  if (!pay) return;
  db.pays = db.pays.filter((x) => x.id !== payId);
  const c = db.clubs.find((x) => x.id === pay.club);
  if (c) {
    const rest = db.pays.filter((x) => x.club === c.id).sort((a, b) => b.to.localeCompare(a.to));
    c.paidUntil = rest[0]?.to ?? null;
    logAdd(db, c.id, 'edit', `Pago anulado · ${moneyText(pay.amount)}`, actor);
  }
}

export function changePlan(db: DemoDb, clubId: string, planId: PlanId, actor: Actor): void {
  const c = db.clubs.find((x) => x.id === clubId);
  if (!c) return;
  const from = plan(db, c.plan);
  const to = plan(db, planId);
  c.plan = planId;
  c.hist = c.hist || [];
  c.hist.push({ at: iso(TODAY), t: 'plan', txt: `Cambio de plan: ${from.name} → ${to.name}`, price: clubPrice(db, c) });
  logAdd(db, c.id, 'plan', `Cambio de plan: ${from.name} → ${to.name}`, actor);
}

export function setSpecialPrice(db: DemoDb, clubId: string, special: SpecialPrice | null, actor: Actor): void {
  const c = db.clubs.find((x) => x.id === clubId);
  if (!c) return;
  c.special = special;
  c.hist = c.hist || [];
  c.hist.push({
    at: iso(TODAY),
    t: 'especial',
    txt: special ? `Precio especial: ${special.type === 'pct' ? `${special.value}% de descuento` : `${moneyText(special.value)} fijo`}${special.until ? ` hasta el ${special.until}` : ''}` : 'Vuelve al precio de lista',
    price: clubPrice(db, c),
  });
  logAdd(db, c.id, 'plan', special ? `Precio especial: ${special.type === 'pct' ? `${special.value}% de descuento` : `${moneyText(special.value)} por mes`}` : 'Se quitó el precio especial', actor);
}

export function suspendClub(db: DemoDb, clubId: string, reason: string, actor: Actor): void {
  const c = db.clubs.find((x) => x.id === clubId);
  if (!c) return;
  c.manual = 'suspendido';
  logAdd(db, c.id, 'sus', `Suspendido a mano${reason.trim() ? ` · ${reason.trim()}` : ''}`, actor);
}

export function unsuspendClub(db: DemoDb, clubId: string, actor: Actor): void {
  const c = db.clubs.find((x) => x.id === clubId);
  if (!c) return;
  c.manual = null;
  logAdd(db, c.id, 'react', 'Se quitó la suspensión', actor);
}

export function cancelClub(db: DemoDb, clubId: string, reason: string, actor: Actor): void {
  const c = db.clubs.find((x) => x.id === clubId);
  if (!c) return;
  c.manual = 'baja';
  c.bajaAt = iso(TODAY);
  c.bajaWhy = reason;
  logAdd(db, c.id, 'baja', `Cliente dado de baja · ${reason}`, actor);
}

export function reactivateClub(db: DemoDb, clubId: string, actor: Actor): void {
  const c = db.clubs.find((x) => x.id === clubId);
  if (!c) return;
  const wasBaja = c.manual === 'baja';
  c.manual = null;
  c.bajaAt = undefined;
  c.bajaWhy = undefined;
  logAdd(db, c.id, 'react', wasBaja ? 'Cliente reactivado' : 'Se quitó la suspensión', actor);
}

export type ClubDataPatch = Partial<Pick<Club, 'name' | 'city' | 'prov' | 'owner' | 'phone' | 'email' | 'tipo' | 'socios' | 'slug'>>;

export function updateClubData(db: DemoDb, clubId: string, patch: ClubDataPatch, actor: Actor): void {
  const c = db.clubs.find((x) => x.id === clubId);
  if (!c) return;
  if (patch.slug && db.clubs.some((x) => x.id !== c.id && x.slug === patch.slug)) throw new Error('slug duplicado');
  const prevSocios = c.socios;
  Object.assign(c, patch);
  if (patch.socios && patch.socios !== prevSocios) {
    c.hist = c.hist || [];
    c.hist.push({ at: iso(TODAY), t: 'socios', txt: `Vecinos: ${prevSocios.toLocaleString('es-AR')} → ${patch.socios.toLocaleString('es-AR')}`, price: clubPrice(db, c) });
  }
  logAdd(db, c.id, 'edit', 'Datos del cliente actualizados', actor);
}

export function setNotes(db: DemoDb, clubId: string, notes: string): void {
  const c = db.clubs.find((x) => x.id === clubId);
  if (c) c.notes = notes;
}

export function setSetup(db: DemoDb, clubId: string, key: SetupKey, done: boolean, actor: Actor): void {
  const c = db.clubs.find((x) => x.id === clubId);
  if (!c) return;
  c.setup = { ...(c.setup || { logo: false, padron: false, cuotas: false, firstPay: false, training: false, online: false, domain: false }), [key]: done };
  if (done && setupPct(c) === 100) logAdd(db, c.id, 'edit', 'Puesta en marcha completa', actor);
}

export function addTask(db: DemoDb, clubId: string, due: string, text: string, actor: Actor): void {
  db.tasks.push({ id: `k${Date.now()}`, club: clubId, due, text: text.trim(), done: false, by: actor.id, byName: actor.name, at: Date.now() });
  db.audit.unshift({ ts: Date.now(), user: actor.id, userName: actor.name, action: 'Seguimiento', detail: `Nuevo seguimiento: ${text.trim()}`, club: clubId });
  db.audit = db.audit.slice(0, 400);
}

export function completeTask(db: DemoDb, taskId: string, actor: Actor): void {
  const t = db.tasks.find((x) => x.id === taskId);
  if (!t) return;
  t.done = true;
  t.doneAt = Date.now();
  logAdd(db, t.club, 'edit', `Seguimiento hecho: ${t.text}`, actor);
}

export function deleteTask(db: DemoDb, taskId: string): void {
  db.tasks = db.tasks.filter((x) => x.id !== taskId);
}

export function logMessage(db: DemoDb, clubId: string, templateName: string, actor: Actor): void {
  logAdd(db, clubId, 'remind', `Mensaje enviado: ${templateName}`, actor);
}

/* ---------- Partners (puerto de partners.js) ---------- */

function auditAdd(db: DemoDb, actor: Actor, action: string, detail: string, club = ''): void {
  db.audit.unshift({ ts: Date.now(), user: actor.id, userName: actor.name, action, detail, club });
  db.audit = db.audit.slice(0, 400);
}

export interface PartnerInput {
  name: string;
  owner: string;
  email: string;
  phone: string;
  city: string;
  prov?: string;
  pct: number;
  code: string;
}

/** Alta o edición de partner desde la administración. */
export function savePartner(db: DemoDb, input: PartnerInput, actor: Actor, partnerId?: string): Partner {
  const clean: PartnerInput = {
    name: input.name.trim(),
    owner: input.owner.trim(),
    email: input.email.trim().toLowerCase(),
    phone: input.phone.trim(),
    city: input.city.trim(),
    prov: input.prov?.trim() || 'Buenos Aires',
    pct: +input.pct || 0,
    code: input.code.trim().toLowerCase(),
  };
  if (partnerId) {
    const p = db.partners.find((x) => x.id === partnerId);
    if (!p) throw new Error('Partner inexistente');
    Object.assign(p, clean);
    auditAdd(db, actor, 'Partner', `${p.name} editado`);
    return p;
  }
  const id = `pt${Date.now()}`;
  const created: Partner = {
    id,
    ...clean,
    prov: clean.prov || 'Buenos Aires',
    short: clean.name.split(' ').slice(0, 2).join(' '),
    house: false,
    active: true,
    since: iso(TODAY),
    color: COLORS[db.partners.length % COLORS.length],
    notes: '',
    users: [{ id: `pu${Date.now()}`, name: clean.owner, email: clean.email, role: 'admin', active: true, last: 0 }],
  };
  db.partners.push(created);
  auditAdd(db, actor, 'Partner', `Nuevo partner: ${created.name} · ${created.pct}%`);
  return created;
}

export function setPartnerActive(db: DemoDb, partnerId: string, active: boolean, actor: Actor): void {
  const p = db.partners.find((x) => x.id === partnerId);
  if (!p) return;
  p.active = active;
  auditAdd(db, actor, 'Partner', `${p.name} ${active ? 'reactivado' : 'suspendido'}`);
}

export interface SettlementInput {
  amount: number;
  method: string;
  ref: string;
}

/** Registra el pago de la comisión de un mes cerrado. */
export function settleCommission(db: DemoDb, partnerId: string, ym: string, input: SettlementInput, actor: Actor): Liquidation {
  const liq: Liquidation = {
    id: `lq${Date.now()}`,
    pid: partnerId,
    ym,
    amount: Math.max(0, +input.amount || 0),
    at: iso(TODAY),
    method: input.method,
    ref: input.ref.trim(),
  };
  db.liq.push(liq);
  auditAdd(db, actor, 'Comisión liquidada', `${pName(db, partnerId)} · ${ym} · ${liq.amount}`);
  return liq;
}

/** Sólo la administración pasa un cliente de un partner a otro. */
export function reassignClubPartner(db: DemoDb, clubId: string, partnerId: string, actor: Actor): void {
  const c = db.clubs.find((x) => x.id === clubId);
  if (!c || c.partner === partnerId) return;
  c.partner = partnerId;
  auditAdd(db, actor, 'Partner del cliente', `${c.name} pasó a ${pName(db, partnerId)}`, c.id);
}
