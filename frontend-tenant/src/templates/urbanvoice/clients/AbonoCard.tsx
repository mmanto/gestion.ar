import { useState } from 'react';
import { useAuth } from '../../../hooks/useAuth';
import { getDb, mutate, useDemoDb } from '../demo/store';
import { BASE_MODS, MODS, clubPays, clubPrice, plan, planRule, specialOn, state } from '../demo/selectors';
import { fD, money, rel } from '../demo/format';
import { actorOf, cancelClub, suspendClub, unsuspendClub } from '../demo/actions';
import { useUvPermissions } from '../permissions';
import { LineIcon } from '../ui/LineIcon';
import { UvIcon } from '../ui/UvIcon';
import { useToast } from '../ui/Toast';
import { ConfirmModal } from './modals/ConfirmModal';
import { PayModal } from './modals/PayModal';
import { PlanModal } from './modals/PlanModal';
import { SpecialPriceModal } from './modals/SpecialPriceModal';

/** Tarjeta «Abono» de la ficha, con las acciones de la demo. */
export function AbonoCard({ clubId }: { clubId: string }) {
  const db = useDemoDb();
  const perms = useUvPermissions();
  const { user } = useAuth();
  const { showToast } = useToast();
  const [planOpen, setPlanOpen] = useState(false);
  const [specialOpen, setSpecialOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [confirm, setConfirm] = useState<'suspend' | 'cancel' | null>(null);
  const [reason, setReason] = useState('');
  const [why, setWhy] = useState('No pagó el abono');

  const c = db.clubs.find((x) => x.id === clubId);
  if (!c) return null;
  const S = state(db, c);
  const p = plan(db, c.plan);
  const pays = clubPays(db, c.id);
  const total = pays.reduce((a, x) => a + x.amount, 0);
  const actor = actorOf(user);

  const doSuspend = () => {
    mutate((draft) => suspendClub(draft, c.id, reason, actor));
    setConfirm(null);
    showToast(<><b>{c.name}</b> quedó suspendido</>);
  };
  const doCancel = () => {
    mutate((draft) => cancelClub(draft, c.id, why, actor));
    setConfirm(null);
    showToast(<><b>{c.name}</b> fue dado de baja</>);
  };

  return (
    <section className="card">
      <div className="ch"><h3>Abono</h3></div>
      {perms.money ? (
        <div className="ab">
          <div>
            <small>Abono mensual</small>
            <b>{money(clubPrice(db, c))}</b>
            <span>Plan {p.name} · {c.socios.toLocaleString('es-AR')} vecinos{specialOn(c) ? <> · <em className="tag">Precio especial</em></> : null}</span>
          </div>
          <div>
            <small>{S.trial ? 'Prueba hasta' : S.left >= 0 ? 'Pagado hasta' : 'Venció el'}</small>
            <b>{fD(S.due)}</b>
            <span>{S.k === 'baja' ? '—' : rel(S.due!)}</span>
          </div>
          <div>
            <small>Pagó en total</small>
            <b>{money(total)}</b>
            <span>{pays.length} {pays.length === 1 ? 'pago' : 'pagos'}</span>
          </div>
        </div>
      ) : (
        <p className="muted sm">Plan {p.name} · {c.socios.toLocaleString('es-AR')} vecinos</p>
      )}
      {perms.money ? (
        <div className="pr-b">
          <span>Plan {p.name}: {planRule(p)}</span>
          {specialOn(c) ? (
            <span className="pr-sp">
              <UvIcon name="cash" />
              Precio especial: {c.special!.type === 'pct'
                ? `${c.special!.value}% de descuento sobre ${money(clubPrice(db, c, c.plan))}`
                : `fijo en lugar de ${money(clubPrice(db, c, c.plan))}`}
              {c.special!.until ? ` hasta el ${fD(c.special!.until)}` : ''}
              {c.special!.why ? ` · ${c.special!.why}` : ''}
            </span>
          ) : null}
        </div>
      ) : null}
      <div className="mods">
        <small>Incluye</small>
        <div>
          <span className="m base">{BASE_MODS}</span>
          {p.mods.map((k) => (
            <span className="m" key={k}>
              <LineIcon emoji={MODS[k][1]} /> {MODS[k][0]}
            </span>
          ))}
        </div>
      </div>
      {S.k !== 'baja' ? (
        <div className="ab-a">
          {perms.plan ? (
            <button type="button" className="btn sm" onClick={() => setPlanOpen(true)}><UvIcon name="layers" />Cambiar de plan</button>
          ) : null}
          {perms.money ? (
            <button type="button" className="btn sm" onClick={() => setSpecialOpen(true)}><UvIcon name="cash" />Precio especial</button>
          ) : null}
          {perms.plan && S.k === 'suspendido' && S.man ? (
            <button type="button" className="btn sm" onClick={() => {
              mutate((draft) => unsuspendClub(draft, c.id, actor));
              showToast(<><b>{c.name}</b> reactivado</>);
              const refreshed = getDb().clubs.find((x) => x.id === c.id);
              if (refreshed && ['atrasado', 'suspendido'].includes(state(getDb(), refreshed).k)) setPayOpen(true);
            }}>
              <UvIcon name="play" />Quitar suspensión
            </button>
          ) : perms.plan && S.k !== 'suspendido' ? (
            <button type="button" className="btn sm" onClick={() => { setReason(''); setConfirm('suspend'); }}><UvIcon name="pause" />Suspender</button>
          ) : null}
          {perms.plan ? (
            <button type="button" className="btn sm ghost danger" onClick={() => { setWhy('No pagó el abono'); setConfirm('cancel'); }}><UvIcon name="trash" />Dar de baja</button>
          ) : null}
        </div>
      ) : null}

      <PlanModal open={planOpen} clubId={c.id} onClose={() => setPlanOpen(false)} />
      <SpecialPriceModal open={specialOpen} clubId={c.id} onClose={() => setSpecialOpen(false)} />
      <PayModal open={payOpen} clubId={c.id} onClose={() => setPayOpen(false)} />
      <ConfirmModal
        open={confirm === 'suspend'}
        title={`Suspender ${c.name}`}
        description="El sitio del cliente va a mostrar «fuera de servicio» y el panel queda bloqueado hasta que lo reactives. Los datos no se borran."
        confirmLabel="Suspender"
        onConfirm={doSuspend}
        onClose={() => setConfirm(null)}
      >
        <label>Motivo (opcional)</label>
        <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ej: pidió pausar por vacaciones" />
      </ConfirmModal>
      <ConfirmModal
        open={confirm === 'cancel'}
        title={`Dar de baja ${c.name}`}
        description="El sitio y el panel del cliente dejan de estar disponibles. No se borra nada: si vuelve, lo reactivás y sigue con sus datos."
        confirmLabel="Dar de baja"
        danger
        onConfirm={doCancel}
        onClose={() => setConfirm(null)}
      >
        <label>Motivo</label>
        <select value={why} onChange={(e) => setWhy(e.target.value)}>
          <option>No pagó el abono</option>
          <option>Cerró el cliente</option>
          <option>Se pasó a otro sistema</option>
          <option>Lo pidió el cliente</option>
          <option>Otro</option>
        </select>
      </ConfirmModal>
    </section>
  );
}
