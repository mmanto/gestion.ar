import { useDemoDb } from '../../demo/store';
import { partnerOf, siteUrl } from '../../demo/selectors';
import { fD, waLink } from '../../demo/format';
import { AbonoCard } from '../AbonoCard';

interface SummaryTabProps {
  clubId: string;
}

export default function SummaryTab({ clubId }: SummaryTabProps) {
  const db = useDemoDb();
  const c = db.clubs.find((x) => x.id === clubId);
  if (!c) return null;
  const partner = partnerOf(db, c);
  const firstName = c.owner.split(' ')[0];

  return (
    <div className="g2 club-g">
      <div>
        <AbonoCard clubId={c.id} />
      </div>
      <div>
        <section className="card">
          <div className="ch"><h3>Datos del cliente</h3></div>
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
        </section>
        <section className="card">
          <div className="ch"><h3>Notas internas</h3></div>
          <p className="muted">{c.notes || 'Solo las ves vos. Ej: paga siempre a fin de mes, prefiere WhatsApp…'}</p>
        </section>
      </div>
    </div>
  );
}
