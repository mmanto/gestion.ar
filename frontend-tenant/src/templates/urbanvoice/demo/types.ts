/** Modelo de la demo UrbanVoice (administracion/js/datos.js y afines). */

export type PlanId = 'basico' | 'pro' | 'full';

export interface Plan {
  id: PlanId;
  name: string;
  base: number;
  incl: number;
  step: number;
  extra: number;
  cap: number;
  desc: string;
  mods: string[];
  top?: boolean;
}

export type ClubStateKey = 'activo' | 'pronto' | 'prueba' | 'atrasado' | 'suspendido' | 'baja';

export type SetupKey = 'logo' | 'padron' | 'cuotas' | 'firstPay' | 'training' | 'online' | 'domain';
export type ClubSetup = Record<SetupKey, boolean>;

export interface ClubUsage {
  w: number[];
  players: number;
  last: string | null;
}

export interface SpecialPrice {
  type: 'pct' | 'fixed';
  value: number;
  until?: string;
  why?: string;
}

export interface HistEntry {
  at: string;
  t: 'alta' | 'plan' | 'socios' | 'especial';
  txt: string;
  price: number;
}

export interface Club {
  id: string;
  name: string;
  slug: string;
  city: string;
  prov: string;
  plan: PlanId;
  owner: string;
  phone: string;
  email: string;
  socios: number;
  tipo: string;
  color: string;
  logo: string;
  notes: string;
  site: string;
  manual: 'baja' | 'suspendido' | null;
  created: string;
  trialEnd: string | null;
  paidUntil: string | null;
  user: string;
  partner?: string;
  bajaAt?: string;
  bajaWhy?: string;
  disc?: string[];
  special?: SpecialPrice | null;
  usage?: ClubUsage;
  setup?: ClubSetup;
  hist?: HistEntry[];
}

export interface Pay {
  id: string;
  n: number;
  club: string;
  date: string;
  amount: number;
  months: number;
  from: string;
  to: string;
  method: string;
  note: string;
  plan?: string;
  socios?: number;
  disc?: number;
}

export type LogType = 'pay' | 'new' | 'baja' | 'remind' | 'sus' | 'react' | 'plan' | 'edit';

export interface LogEntry {
  at: string;
  ts?: number;
  t: LogType;
  club: string;
  txt: string;
}

export interface DemoUser {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'ventas' | 'cobranzas' | 'soporte';
  active: boolean;
  last: number;
}

export interface AuditEntry {
  ts: number;
  user: string;
  userName?: string;
  action: string;
  detail: string;
  club: string;
}

export interface MessageTemplate {
  id: string;
  name: string;
  text: string;
}

export interface PartnerUser {
  id: string;
  name: string;
  email: string;
  role: string;
  last: number;
}

export interface Partner {
  id: string;
  name: string;
  short?: string;
  house?: boolean;
  owner: string;
  email: string;
  phone: string;
  city: string;
  prov: string;
  pct: number;
  code: string;
  active: boolean;
  since: string;
  color: string;
  notes: string;
  users: PartnerUser[];
}

export interface Task {
  id: string;
  club: string;
  due: string;
  text: string;
  done: boolean;
  by: string;
  byName?: string;
  at: number;
  doneAt?: number;
}

export interface DemoConfig {
  trial: number;
  grace: number;
  autoSusp: boolean;
  soon: number;
  disc: Record<number, number>;
  alias: string;
  cbu: string;
  holder: string;
  cuit: string;
  wa: string;
  mail: string;
  domain: string;
  msg: string;
}

export interface DemoDb {
  v: 1;
  plans: Plan[];
  clubs: Club[];
  pays: Pay[];
  log: LogEntry[];
  partners: Partner[];
  users: DemoUser[];
  audit: AuditEntry[];
  tpls: MessageTemplate[];
  tasks: Task[];
  cfg: DemoConfig;
  nextN: number;
}

export interface ListFilters {
  q: string;
  st: ClubStateKey | '';
  plan: string;
  part: string;
  tipo: string;
}

export type PendingTone = 'bad' | 'warn' | 'info' | 'ok';
export interface Pending {
  clubId: string;
  text: string;
  tone: PendingTone;
}

export interface ClubState {
  k: ClubStateKey;
  due: Date | null;
  cut: Date | null;
  left: number;
  trial: boolean;
  man?: boolean;
}

export type HealthKey = 'bien' | 'poco' | 'riesgo' | 'nuevo' | 'off';
export interface Health {
  k: HealthKey;
  why?: string;
  days: number;
}
