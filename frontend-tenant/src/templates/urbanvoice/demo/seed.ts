/** Semilla de la demo — puerto de datos.js, partners.js, equipo.js y mensajes.js. */

import { TODAY, addD, addM, diff, hsh, iso, pd } from './format';
import { MODS, SETUP, planPrice } from './selectors';
import type {
  AuditEntry, Club, DemoConfig, DemoDb, DemoUser, LogEntry, MessageTemplate, Partner, Pay, Plan, Task,
} from './types';

const COLORS = ['#F9A30A', '#2563EB', '#0E9F6E', '#DC2626', '#7C3AED', '#0891B2', '#DB2777', '#65A30D', '#EA580C', '#4F46E5', '#0F766E', '#B45309'];
const slugOf = (s: string): string => s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[^a-z0-9]+/g, '').slice(0, 20);

function seed() {
  const T = TODAY;
  const I = (d: Date): string => iso(d);
  const plans: Plan[] = [
    { id: 'basico', name: 'Básico', base: 35000, incl: 150, step: 100, extra: 5000, cap: 70000, desc: 'Para empezar: mapa de reclamos geolocalizados, registro de vecinos y panel de estadísticas.', mods: ['comunicacion'] },
    { id: 'pro', name: 'Pro', base: 55000, incl: 300, step: 100, extra: 8000, cap: 130000, desc: 'El más elegido: suma el asistente con IA 24 hs, agenda de eventos y reportes por zona.', mods: ['comunicacion', 'eventos', 'reportes'], top: true },
    { id: 'full', name: 'Full', base: 85000, incl: 500, step: 100, extra: 10000, cap: 200000, desc: 'Todo UrbanVoice: también informes avanzados de tendencias para campañas y propuestas.', mods: Object.keys(MODS) },
  ];

  // [nombre, localidad, provincia, plan, meses desde el alta, días hasta el vencimiento (o null), extra]
  const R: Array<[string, string, string, Plan['id'], number, number | null, Record<string, unknown>]> = [
    ['Equipo de Campaña Bolívar Futura', 'San Carlos de Bolívar', 'Buenos Aires', 'full', 7, 18, { site: 'bolivar', owner: 'Martín Ferrari', socios: 1046, tipo: 'Candidatura', color: '#1E5FD6', disc: ['Alumbrado', 'Bacheo y calles', 'Residuos', 'Seguridad', 'Espacios verdes', 'Transporte', 'Salud'] }],
    ['Concejal Lucía Benítez', 'Tandil', 'Buenos Aires', 'pro', 13, 4, { owner: 'Lucía Benítez', socios: 640, tipo: 'Concejal' }],
    ['Foro Vecinal Olavarría', 'Olavarría', 'Buenos Aires', 'basico', 9, -3, { owner: 'Hernán Sosa', socios: 210, tipo: 'Organización vecinal' }],
    ['Frente Ciudadano Mar del Plata', 'Mar del Plata', 'Buenos Aires', 'full', 14, 22, { owner: 'Carolina Ruiz', socios: 1450, tipo: 'Candidatura' }],
    ['Bloque Vecinal Bahía Blanca', 'Bahía Blanca', 'Buenos Aires', 'pro', 11, -15, { owner: 'Diego Molina', socios: 520, tipo: 'Concejal' }],
    ['Referente Barrial Marcela Ortiz', 'Azul', 'Buenos Aires', 'basico', 0, null, { owner: 'Marcela Ortiz', socios: 95, tipo: 'Referente barrial', trial: 9 }],
    ['Rosario Participa', 'Rosario', 'Santa Fe', 'full', 10, 11, { owner: 'Pablo Acosta', socios: 980, tipo: 'Agrupación política' }],
    ['Mesa Barrial Córdoba Norte', 'Córdoba', 'Córdoba', 'pro', 6, 26, { owner: 'Sofía Herrera', socios: 430, tipo: 'Organización vecinal' }],
    ['Junín Propone', 'Junín', 'Buenos Aires', 'basico', 5, 2, { owner: 'Ramiro Gómez', socios: 160, tipo: 'Referente barrial' }],
    ['Necochea Activa', 'Necochea', 'Buenos Aires', 'pro', 12, -48, { owner: 'Andrés Castro', socios: 300, tipo: 'Candidatura', manual: 'baja' }],
    ['Pergamino en Acción', 'Pergamino', 'Buenos Aires', 'pro', 0, null, { owner: 'Valeria Díaz', socios: 260, tipo: 'Candidatura', trial: 2 }],
    ['Asociación Vecinal Los Pinos', 'Tres Arroyos', 'Buenos Aires', 'full', 3, 15, { owner: 'Julián Romero', socios: 350, tipo: 'Organización vecinal' }],
    ['Compromiso San Nicolás', 'San Nicolás', 'Buenos Aires', 'pro', 2, 9, { owner: 'Natalia Paz', socios: 410, tipo: 'Agrupación política' }],
  ];

  const clubs: Club[] = [];
  const pays: Pay[] = [];
  const log: LogEntry[] = [];
  R.forEach(([name, city, prov, planId, mAgo, due, x], k) => {
    const id = `c${k + 1}`;
    const price = planPrice(plans.find((p) => p.id === planId)!, x.socios as number);
    const c: Club = {
      id,
      name,
      slug: slugOf(name),
      city,
      prov,
      plan: planId,
      owner: x.owner as string,
      phone: `2${String(214000000 + k * 7654321).slice(0, 9)}`,
      email: `${(x.owner as string).split(' ')[0].toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')}@${slugOf(name)}.com.ar`,
      socios: x.socios as number,
      tipo: x.tipo as string,
      color: (x.color as string) || COLORS[k % COLORS.length],
      logo: '',
      notes: '',
      site: (x.site as string) || '',
      manual: (x.manual as Club['manual']) || null,
      created: '',
      trialEnd: null,
      paidUntil: null,
      user: `admin@${slugOf(name)}.com.ar`,
    };
    if (x.trial != null) {
      c.trialEnd = I(addD(T, x.trial as number));
      c.created = I(addD(T, (x.trial as number) - 15));
    } else {
      c.paidUntil = I(addD(T, due as number));
      let to = pd(c.paidUntil)!;
      let n = 0;
      const L: Array<[Date, Date]> = [];
      while (n < 60) {
        const from = addM(to, -1);
        L.unshift([from, to]);
        to = from;
        n++;
        if (diff(T, from) >= mAgo * 30.4) break;
      }
      c.trialEnd = I(addD(L[0][0], 0));
      c.created = I(addD(L[0][0], -15));
      L.forEach(([f, t], j) => {
        const paid = addD(f, -((k + j) % 4));
        if (paid > T) return;
        pays.push({ id: `p${id}-${j}`, n: 0, club: id, date: I(paid), amount: price, months: 1, from: I(f), to: I(t), method: ['Transferencia', 'Mercado Pago', 'Transferencia', 'Efectivo'][(k + j) % 4], note: '' });
      });
      if (x.manual === 'baja') {
        c.bajaAt = I(addD(T, -6));
        c.bajaWhy = 'No pagó el abono después de la suspensión';
      }
    }
    if (x.disc) c.disc = x.disc as string[];
    clubs.push(c);
  });

  pays.sort((a, b) => b.date.localeCompare(a.date));
  pays.slice(0, 6).forEach((p) => log.push({ at: p.date, t: 'pay', club: p.club, txt: `Pago recibido · ${p.amount}` }));
  clubs.filter((c) => diff(TODAY, pd(c.created)!) < 70).forEach((c) => log.push({ at: c.created, t: 'new', club: c.id, txt: 'Cliente dado de alta' }));
  log.push({ at: I(addD(T, -6)), t: 'baja', club: 'c10', txt: 'Cliente dado de baja' });
  log.push({ at: I(addD(T, -2)), t: 'remind', club: 'c3', txt: 'Recordatorio de pago enviado' });
  log.sort((a, b) => b.at.localeCompare(a.at));

  pays.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id)).forEach((x, i) => { x.n = i + 1; });

  const cfg: DemoConfig = {
    trial: 15, grace: 7, autoSusp: true, soon: 7, disc: { 1: 0, 3: 5, 6: 10, 12: 15 },
    alias: 'urbanvoice.cobros', cbu: '0000003100098765432101', holder: 'UrbanVoice S.A.S.', cuit: '30-71845236-9',
    wa: '2212267836', mail: 'cobros@urbanvoice.com', domain: 'urbanvoice.com',
    msg: 'Hola {dueño}! Te escribimos de UrbanVoice. El abono de {cliente} (plan {plan}, {monto}) {vence}. Podés pagar por transferencia al alias {alias}. Cuando lo hagas, mandanos el comprobante por acá. ¡Gracias!',
  };

  return { plans, clubs, pays, log, cfg, nextN: pays.length + 1 };
}

function clubExtras(c: Club, plans: Plan[]): void {
  const h = hsh(c.id);
  const ageD = diff(TODAY, pd(c.created)!);
  const N = 12;
  const w: number[] = [];
  const prof = ({ c3: 'baja', c5: 'corta', c9: 'poco', c10: 'cero' } as Record<string, string>)[c.id];
  for (let i = 0; i < N; i++) {
    const wkAgo = N - 1 - i;
    const alive = ageD - wkAgo * 7 > 10;
    let v = alive ? Math.round(Math.max(1, c.socios / 100) * (13 + ((h + i * 7) % 9))) : 0;
    if (alive && ageD < 120) v = Math.round(v * Math.min(1, (ageD - wkAgo * 7) / 90 + 0.35));
    if (prof === 'baja') v = Math.round(v * (1 - i / 16));
    if (prof === 'corta' && wkAgo < 3) v = Math.round(v * 0.12);
    if (prof === 'poco') v = Math.round(v * 0.3);
    if (prof === 'cero' && wkAgo < 8) v = 0;
    w.push(Math.max(0, v));
  }
  const lastD = ({ c3: 5, c5: 21, c9: 16, c10: 55, c6: 1, c11: 0 } as Record<string, number>)[c.id] ?? h % 3;
  c.usage = c.usage || { w, players: Math.round((w.reduce((a, x) => a + x, 0) / N) * 2.4), last: iso(addD(TODAY, -lastD)) };
  if (!c.setup) {
    const all = Object.fromEntries(SETUP.map(([k]) => [k, k !== 'domain'])) as Club['setup'];
    c.setup = ageD > 60 ? all : { logo: true, padron: true, cuotas: ageD > 3, firstPay: ageD > 4, training: ageD > 40, online: ageD > 30, domain: false };
    if (c.id === 'c13') {
      c.setup!.training = false;
      c.setup!.online = false;
    }
  }
  if (!c.hist) {
    const p = plans.find((x) => x.id === c.plan)!;
    c.hist = [{ at: c.created, t: 'alta', txt: `Alta con plan ${p.name} · ${c.socios} vecinos`, price: planPrice(p, c.socios) }];
    if (c.id === 'c4') {
      const pr = plans.find((x) => x.id === 'pro') || p;
      c.hist[0] = { at: c.created, t: 'alta', txt: `Alta con plan ${pr.name} · ${c.socios} vecinos`, price: planPrice(pr, c.socios) };
      c.hist.push({ at: iso(addD(TODAY, -150)), t: 'plan', txt: `Cambio de plan: ${pr.name} → ${p.name}`, price: planPrice(p, c.socios) });
    }
    if (c.id === 'c2') {
      c.hist[0] = { at: c.created, t: 'alta', txt: `Alta con plan ${p.name} · 560 vecinos`, price: planPrice(p, 560) };
      c.hist.push({ at: iso(addD(TODAY, -95)), t: 'socios', txt: `Vecinos: 560 → ${c.socios}`, price: planPrice(p, c.socios) });
    }
  }
}

const partnersSeed = (): Partner[] => {
  const t = Date.now();
  const h = 36e5;
  const U = (id: string, name: string, email: string, role: string, last: number) => ({ id, name, email, role, last });
  return [
    { id: 'pt0', name: 'UrbanVoice Directo', short: 'Directo', house: true, owner: 'Equipo comercial', email: 'ventas@urbanvoice.com', phone: '2212267836', city: 'La Plata', prov: 'Buenos Aires', pct: 0, code: 'directo', active: true, since: '2025-01-10', color: '#071C70', notes: 'Partner interno: ventas propias y pedidos de demo que no vienen de ningún partner. No cobra comisión.', users: [U('pu0', 'Diego Giovannetti', 'diego@urbanvoice.com', 'admin', t - 26 * h)] },
    { id: 'pt1', name: 'Estudio Digital Sur', short: 'Estudio Sur', owner: 'Juan Pérez', email: 'juan@estudiosur.com.ar', phone: '2214558810', city: 'La Plata', prov: 'Buenos Aires', pct: 20, code: 'estudiosur', active: true, since: '2025-03-04', color: '#7C3AED', notes: 'Agencia de La Plata que trabaja con concejales y referentes barriales.', users: [U('pu1', 'Juan Pérez', 'juan@estudiosur.com.ar', 'admin', t - 3 * h), U('pu1b', 'Camila Ortiz', 'camila@estudiosur.com.ar', 'vendedor', t - 2 * 24 * h)] },
    { id: 'pt2', name: 'Consultora Costa Atlántica', short: 'Costa Atlántica', owner: 'Carolina Vega', email: 'carolina@costaatlantica.com.ar', phone: '2236617755', city: 'Mar del Plata', prov: 'Buenos Aires', pct: 15, code: 'costa', active: true, since: '2025-06-18', color: '#0EA5A4', notes: 'Consultora de comunicación y datos de la costa atlántica.', users: [U('pu2', 'Carolina Vega', 'carolina@costaatlantica.com.ar', 'admin', t - 30 * h)] },
    { id: 'pt3', name: 'Andes Consultores', short: 'Andes', owner: 'Federico Aguirre', email: 'federico@andesconsultores.com.ar', phone: '3514883201', city: 'Córdoba', prov: 'Córdoba', pct: 20, code: 'andes', active: true, since: '2025-09-02', color: '#F59E0B', notes: 'Se enfoca en agrupaciones y organizaciones vecinales del interior.', users: [U('pu3', 'Federico Aguirre', 'federico@andesconsultores.com.ar', 'admin', t - 5 * 24 * h)] },
  ];
};

const P_CLUBS: Record<string, string> = {
  'Concejal Lucía Benítez': 'pt1', 'Foro Vecinal Olavarría': 'pt1', 'Frente Ciudadano Mar del Plata': 'pt2',
  'Bloque Vecinal Bahía Blanca': 'pt0', 'Referente Barrial Marcela Ortiz': 'pt1', 'Rosario Participa': 'pt0',
  'Mesa Barrial Córdoba Norte': 'pt3', 'Junín Propone': 'pt0', 'Necochea Activa': 'pt2', 'Pergamino en Acción': 'pt1',
  'Asociación Vecinal Los Pinos': 'pt2', 'Compromiso San Nicolás': 'pt0',
};

const usersSeed = (): DemoUser[] => {
  const last = Date.now();
  return [
    { id: 'u1', name: 'Martín Bruno', email: 'martin@urbanvoice.com', role: 'admin', active: true, last },
    { id: 'u2', name: 'Diego Giovannetti', email: 'diego@urbanvoice.com', role: 'ventas', active: true, last: last - 26 * 36e5 },
    { id: 'u3', name: 'Gabriel Suárez', email: 'gabriel@urbanvoice.com', role: 'cobranzas', active: true, last: last - 3 * 24 * 36e5 },
    { id: 'u4', name: 'Sofía Martínez', email: 'sofia@urbanvoice.com', role: 'soporte', active: true, last: last - 5 * 36e5 },
    { id: 'u5', name: 'Matías Ferreyra', email: 'matias@urbanvoice.com', role: 'soporte', active: true, last: last - 2 * 36e5 },
  ];
};

const auditSeed = (): AuditEntry[] => {
  const t = Date.now();
  const h = 36e5;
  return [
    { ts: t - 2 * h, user: 'u3', action: 'Pago', detail: 'Pago recibido · $96.000', club: 'c8' },
    { ts: t - 5 * h, user: 'u4', action: 'Soporte', detail: 'Respuesta de soporte enviada', club: 'c7' },
    { ts: t - 27 * h, user: 'u2', action: 'Alta de cliente', detail: 'Cliente dado de alta · plan Básico', club: 'c6' },
    { ts: t - 50 * h, user: 'u1', action: 'Planes', detail: 'Plan Pro guardado', club: '' },
  ];
};

const tplsSeed = (): MessageTemplate[] => [
  { id: 'bienvenida', name: 'Bienvenida', text: '¡Hola {dueño}! Bienvenido a UrbanVoice. Ya está listo {cliente}.\n\nTu sitio: https://{sitio}\nUsuario del panel: {usuario}\n\nCuando entres por primera vez, el sistema te guía para cargar tus zonas, las categorías de reclamos y el mensaje de bienvenida a los vecinos. Cualquier duda, escribinos por acá.' },
  { id: 'prueba', name: 'Fin de la prueba', text: 'Hola {dueño}! ¿Cómo vienen con UrbanVoice en {cliente}? Te cuento que el período de prueba {vence}. Para seguir, el abono del plan {plan} es de {monto}. Podés pagar por transferencia al alias {alias}. ¿Te ayudo con algo antes?' },
  { id: 'suspension', name: 'Aviso de suspensión', text: 'Hola {dueño}. El abono de {cliente} {vence} y todavía no registramos el pago. Si no se acredita, el sitio y el panel de {cliente} se suspenden en los próximos días. Podés transferir al alias {alias} y mandarnos el comprobante por acá. ¡Gracias!' },
  { id: 'checkin', name: '¿Cómo vienen?', text: 'Hola {dueño}! Te escribo de UrbanVoice para saber cómo vienen con la plataforma en {cliente}. ¿Hay algo en lo que te podamos dar una mano?' },
  { id: 'reactivado', name: 'Cliente reactivado', text: '¡Hola {dueño}! Ya registramos el pago y {cliente} vuelve a estar funcionando: el sitio y el panel ya están activos. ¡Gracias!' },
];

const tasksSeed = (): Task[] => [
  { id: 'k1', club: 'c2', due: iso(TODAY), text: 'Llamar a Lucía: quiere pasar al plan Full para sumar los informes avanzados', done: false, by: 'u1', at: Date.now() - 4 * 864e5 },
  { id: 'k2', club: 'c13', due: iso(addD(TODAY, 1)), text: 'Revisar que estén cargando las zonas y los vecinos', done: false, by: 'u4', at: Date.now() - 2 * 864e5 },
  { id: 'k3', club: 'c9', due: iso(addD(TODAY, -2)), text: 'Visitar al equipo y capacitar a la nueva responsable de comunicación', done: false, by: 'u2', at: Date.now() - 9 * 864e5 },
  { id: 'k4', club: 'c4', due: iso(addD(TODAY, 6)), text: 'Ofrecerle 12 meses con descuento antes de fin de año', done: false, by: 'u3', at: Date.now() - 864e5 },
];

export function seedDb(): DemoDb {
  const base = seed();
  base.clubs.forEach((c) => {
    clubExtras(c, base.plans);
    c.partner = P_CLUBS[c.name] || 'pt0';
  });
  return {
    v: 1,
    plans: base.plans,
    clubs: base.clubs,
    pays: base.pays,
    log: base.log,
    partners: partnersSeed(),
    users: usersSeed(),
    audit: auditSeed(),
    tpls: tplsSeed(),
    tasks: tasksSeed(),
    cfg: base.cfg,
    nextN: base.nextN,
  };
}
