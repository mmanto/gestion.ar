/** Plantillas de WhatsApp — puerto de mensajes.js. */

import { TODAY, diff, fD, iso, money, nS, pd, rel } from './format';
import { clubPrice, health, plan, siteUrl, state } from './selectors';
import type { Club, DemoDb } from './types';

export interface TemplateItem {
  id: string;
  name: string;
  text: string;
  fixed?: boolean;
}

export const tplList = (db: DemoDb): TemplateItem[] => [
  { id: 'pago', name: 'Recordatorio de pago', text: db.cfg.msg, fixed: true },
  ...db.tpls,
];

export function fillTemplate(db: DemoDb, text: string, c: Club): string {
  const S = state(db, c);
  const p = plan(db, c.plan);
  const vence = S.k === 'prueba'
    ? `termina ${rel(iso(S.due!))} (${fD(S.due)})`
    : S.k === 'baja'
      ? 'está dado de baja'
      : S.left >= 0
        ? `vence ${rel(iso(S.due!))} (${fD(S.due)})`
        : `venció el ${fD(S.due)}`;
  const vars: Record<string, string> = {
    '{dueño}': c.owner.split(' ')[0],
    '{cliente}': c.name,
    '{plan}': p.name,
    '{monto}': `${money(clubPrice(db, c))} por mes`,
    '{vence}': vence,
    '{alias}': db.cfg.alias,
    '{sitio}': siteUrl(db, c),
    '{usuario}': c.user,
    '{vecinos}': nS(c.socios),
  };
  return String(text || '').replace(/\{(dueño|cliente|plan|monto|vence|alias|sitio|usuario|vecinos)\}/g, (m) => vars[m] ?? m);
}

export function tplSuggest(db: DemoDb, c: Club): string {
  const k = state(db, c).k;
  const H = health(db, c);
  return k === 'suspendido' ? 'suspension'
    : k === 'atrasado' || k === 'pronto' ? 'pago'
      : k === 'prueba' ? 'prueba'
        : H.k === 'riesgo' || H.k === 'poco' ? 'checkin'
          : diff(TODAY, pd(c.created)!) < 15 ? 'bienvenida' : 'checkin';
}
