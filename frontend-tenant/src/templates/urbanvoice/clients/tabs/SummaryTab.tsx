import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useAuth } from '../../../../hooks/useAuth';
import { mutate, useDemoDb } from '../../demo/store';
import { partnerOf, siteUrl, tasksOf, userName } from '../../demo/selectors';
import { TODAY, addD, fD, fDs, iso, rel, relTs, waLink } from '../../demo/format';
import { actorOf, addTask, completeTask, deleteTask, setNotes } from '../../demo/actions';
import { useUvPermissions } from '../../permissions';
import { UvIcon } from '../../ui/UvIcon';
import { useToast } from '../../ui/Toast';
import { AbonoCard } from '../AbonoCard';
import { EditClientModal } from '../modals/EditClientModal';
import { PasswordModal } from '../modals/PasswordModal';
import { ReassignPartnerModal } from '../../partners/modals/ReassignPartnerModal';

interface SummaryTabProps {
  clubId: string;
}

const taskWhen = (due: string): string => {
  const n = Math.round((new Date(`${due}T00:00:00`).getTime() - TODAY.getTime()) / 864e5);
  return n < 0 ? `venció ${rel(due)}` : n === 0 ? 'para hoy' : n === 1 ? 'para mañana' : `para el ${fDs(due)}`;
};

export default function SummaryTab({ clubId }: SummaryTabProps) {
  const db = useDemoDb();
  const perms = useUvPermissions();
  const { user } = useAuth();
  const { showToast } = useToast();
  const c = db.clubs.find((x) => x.id === clubId);
  const [editOpen, setEditOpen] = useState(false);
  const [passOpen, setPassOpen] = useState(false);
  const [partnerOpen, setPartnerOpen] = useState(false);
  const [notes, setNotesDraft] = useState('');
  const [taskText, setTaskText] = useState('');
  const [taskDue, setTaskDue] = useState(iso(addD(TODAY, 1)));

  useEffect(() => {
    if (c) setNotesDraft(c.notes || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c?.id]);

  if (!c) return null;
  const partner = partnerOf(db, c);
  const firstName = c.owner.split(' ')[0];
  const allTasks = tasksOf(db, c.id);
  const pending = allTasks.filter((t) => !t.done).sort((a, b) => a.due.localeCompare(b.due));
  const done = allTasks.filter((t) => t.done).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0)).slice(0, 3);
  const actor = actorOf(user);

  const saveNotes = () => {
    mutate((draft) => setNotes(draft, c.id, notes));
  };

  const submitTask = (e: FormEvent) => {
    e.preventDefault();
    if (!taskText.trim()) return;
    mutate((draft) => addTask(draft, c.id, taskDue, taskText, actor));
    setTaskText('');
    setTaskDue(iso(addD(TODAY, 1)));
    showToast('Seguimiento agendado');
  };

  return (
    <>
      <div className="g2 club-g">
        <div>
          <AbonoCard clubId={c.id} />
          <section className="card">
            <div className="ch">
              <h3>Seguimientos</h3>
              {pending.length ? <span className="chip-s">{pending.length} {pending.length === 1 ? 'pendiente' : 'pendientes'}</span> : null}
            </div>
            <form className="tk-f" onSubmit={submitTask}>
              <input placeholder="Ej: llamarlo por el cambio de plan" required maxLength={140} value={taskText} onChange={(e) => setTaskText(e.target.value)} />
              <div className="tk-w">
                <input type="date" value={taskDue} min={iso(TODAY)} required onChange={(e) => setTaskDue(e.target.value)} />
                <div className="tk-q">
                  {[['Hoy', 0], ['Mañana', 1], ['En 3 días', 3], ['En una semana', 7]].map(([label, n]) => (
                    <button type="button" key={label} onClick={() => setTaskDue(iso(addD(TODAY, Number(n))))}>{label}</button>
                  ))}
                </div>
                <button className="btn sm pri"><UvIcon name="plus" />Agregar</button>
              </div>
            </form>
            {pending.length || done.length ? (
              <div className="tk-l">
                {pending.map((t) => {
                  const n = Math.round((new Date(`${t.due}T00:00:00`).getTime() - TODAY.getTime()) / 864e5);
                  return (
                    <div className={`tk-i ${n < 0 ? 'late' : n === 0 ? 'today' : ''}`} key={t.id}>
                      <button type="button" className="tk-c" title="Marcar como hecho" aria-label="Marcar como hecho" onClick={() => { mutate((draft) => completeTask(draft, t.id, actor)); showToast('Seguimiento marcado como hecho'); }} />
                      <div><b>{t.text}</b><small>{taskWhen(t.due)} · lo anotó {userName(db, t.by, t.byName)}</small></div>
                      <button type="button" className="ico sm" title="Borrar" aria-label="Borrar" onClick={() => mutate((draft) => deleteTask(draft, t.id))}><UvIcon name="x" /></button>
                    </div>
                  );
                })}
                {done.map((t) => (
                  <div className="tk-i done" key={t.id}>
                    <span className="tk-c on"><UvIcon name="check" /></span>
                    <div><b>{t.text}</b><small>Hecho {relTs(t.doneAt || t.at)}</small></div>
                  </div>
                ))}
              </div>
            ) : <p className="muted sm">Anotá lo que tenés que hacer con este cliente.</p>}
          </section>
        </div>
        <div>
          <section className="card">
            <div className="ch">
              <h3>Datos del cliente</h3>
              {perms.edit ? <button type="button" className="btn sm ghost" onClick={() => setEditOpen(true)}><UvIcon name="edit" />Editar</button> : null}
            </div>
            <dl className="dl">
              <dt>Responsable</dt><dd>{c.owner}</dd>
              <dt>WhatsApp</dt>
              <dd><a href={waLink(c.phone, `Hola ${firstName}! Te escribimos de UrbanVoice.`)} target="_blank" rel="noopener noreferrer">{c.phone}</a></dd>
              <dt>Email</dt><dd>{c.email}</dd>
              <dt>Partner</dt><dd>{partner ? partner.name : '—'}</dd>
              <dt>Usuario del panel</dt><dd>{c.user}</dd>
              <dt>Dirección web</dt><dd>{siteUrl(db, c)}</dd>
              <dt>Tipo de cliente</dt><dd>{c.tipo || '—'}</dd>
              <dt>Origen</dt><dd>Directo</dd>
              <dt>Vecinos</dt><dd>{c.socios.toLocaleString('es-AR')}</dd>
              <dt>Alta</dt><dd>{fD(c.created)}</dd>
            </dl>
            <div className="acc-a">
              {perms.plan ? <button type="button" className="btn sm" onClick={() => setPassOpen(true)}><UvIcon name="key" />Nueva contraseña</button> : null}
              {perms.edit ? <button type="button" className="btn sm" onClick={() => setPartnerOpen(true)}><UvIcon name="team" />Cambiar partner</button> : null}
            </div>
          </section>
          <section className="card">
            <div className="ch"><h3>Notas internas</h3></div>
            <textarea
              placeholder="Solo las ves vos. Ej: paga siempre a fin de mes, prefiere WhatsApp…"
              value={notes}
              onChange={(e) => setNotesDraft(e.target.value)}
              onBlur={saveNotes}
            />
          </section>
        </div>
      </div>
      <EditClientModal open={editOpen} clubId={c.id} onClose={() => setEditOpen(false)} />
      <PasswordModal open={passOpen} clubId={c.id} onClose={() => setPassOpen(false)} />
      <ReassignPartnerModal open={partnerOpen} clubId={c.id} onClose={() => setPartnerOpen(false)} />
    </>
  );
}
