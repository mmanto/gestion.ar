import { useDemoDb } from '../../demo/store';
import { mLabel, pComm, pDetail, partner } from '../../demo/selectors';
import { money } from '../../demo/format';
import { Modal } from '../../ui/Modal';

interface SettlementDetailModalProps {
  open: boolean;
  partnerId: string;
  ym: string | null;
  onClose: () => void;
}

/** Lo que pagó cada cliente del partner en un mes y su comisión. */
export function SettlementDetailModal({ open, partnerId, ym, onClose }: SettlementDetailModalProps) {
  const db = useDemoDb();
  const p = partner(db, partnerId);
  if (!p || !ym) return null;
  const rows = pDetail(db, p.id, ym);

  return (
    <Modal open={open} title={mLabel(ym)} onClose={onClose}>
      <p className="muted">Lo que pagó cada cliente de {p.name} y su comisión ({p.pct}%).</p>
      <div className="tbl-w">
        <table className="tbl">
          <thead>
            <tr><th>Cliente</th><th className="r">Pagó</th><th className="r">Comisión</th></tr>
          </thead>
          <tbody>
            {rows.map((x) => (
              <tr key={x.c.id}>
                <td>{x.name}<small>{x.kind}</small></td>
                <td className="r">{money(x.amount)}</td>
                <td className="r"><b>{money(Math.round((x.amount * p.pct) / 100))}</b></td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td><b>Total</b></td>
              <td className="r"><b>{money(rows.reduce((a, x) => a + x.amount, 0))}</b></td>
              <td className="r"><b>{money(pComm(db, p.id, ym))}</b></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </Modal>
  );
}
