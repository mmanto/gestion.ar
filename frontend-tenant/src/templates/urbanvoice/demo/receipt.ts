/** Recibo y descargas — puerto de cobros.js. */

import { fD, money, nS, waLink } from './format';
import type { DemoDb, Pay } from './types';

const esc = (s: unknown): string => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

function receiptNumber(x: Pay): string {
  return `0001-${String(x.n || 0).padStart(8, '0')}`;
}

export function openReceipt(db: DemoDb, payId: string): void {
  const x = db.pays.find((p) => p.id === payId);
  if (!x) return;
  const c = db.clubs.find((p) => p.id === x.club);
  if (!c) return;
  const C = db.cfg;
  const nro = receiptNumber(x);
  const w = window.open('', '_blank');
  if (!w) return;
  const logo = new URL('/uv/logo-icono.png', window.location.href).href;
  w.document.write(`<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Recibo ${nro} · ${esc(c.name)}</title><meta name="viewport" content="width=device-width,initial-scale=1">
  <style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:Inter,system-ui,sans-serif;color:#071C70;background:#F4F5F8;padding:30px 16px}.r{max-width:720px;margin:0 auto;background:#fff;border-radius:16px;padding:40px;box-shadow:0 10px 40px rgba(14,26,58,.08)}
  .h{display:flex;justify-content:space-between;gap:20px;align-items:flex-start;border-bottom:2px solid #087CF5;padding-bottom:22px;flex-wrap:wrap}.b{display:flex;gap:10px;align-items:center;font-size:24px;font-weight:900;letter-spacing:-.03em;color:#15237A}.b img{height:30px;width:auto}.b b{color:#087CF5}
  .h small,.f{color:#6B7591;font-size:12.5px;line-height:1.6}.n{text-align:right}.n h1{font-size:22px;letter-spacing:.04em}.n p{font-size:14px;color:#4B5675}
  .g{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin:26px 0}.g div{background:#F7F8FA;border-radius:12px;padding:14px 16px}.g small{display:block;color:#8A93A8;font-size:12px;margin-bottom:4px}.g b{font-size:15px}
  table{width:100%;border-collapse:collapse;margin:8px 0 20px}th{text-align:left;font-size:12px;color:#8A93A8;text-transform:uppercase;letter-spacing:.04em;padding:10px 0;border-bottom:1px solid #ECEEF4}td{padding:14px 0;border-bottom:1px solid #ECEEF4;font-size:14px}.t{text-align:right}
  .tot{display:flex;justify-content:flex-end;gap:30px;align-items:baseline;font-size:15px}.tot b{font-size:26px}.a{display:flex;gap:10px;justify-content:center;margin-top:20px}.a button{font:inherit;font-weight:700;border:0;border-radius:10px;padding:12px 22px;cursor:pointer;background:#087CF5;color:#fff}.a button+button{background:#fff;color:#071C70;border:1px solid #ECEEF4}
  @media print{body{background:#fff;padding:0}.r{box-shadow:none;padding:10px}.a{display:none}}@media (max-width:560px){.r{padding:24px}.g{grid-template-columns:1fr}.n{text-align:left}}</style></head><body>
  <div class="r"><div class="h"><div><div class="b"><img src="${logo}" alt=""><span>Urban<b>Voice</b></span></div><small>${esc(C.holder)} · CUIT ${esc(C.cuit)}<br>${esc(C.mail)} · ${esc(C.wa)}</small></div><div class="n"><h1>RECIBO</h1><p>N° ${nro}</p><p>${fD(x.date)}</p></div></div>
  <div class="g"><div><small>Recibimos de</small><b>${esc(c.name)}</b><br><span style="font-size:13px;color:#4B5675">${esc(c.owner)} · ${esc(c.city)}${c.prov ? `, ${esc(c.prov)}` : ''}</span></div><div><small>Medio de pago</small><b>${esc(x.method)}</b>${x.note ? `<br><span style="font-size:13px;color:#4B5675">${esc(x.note)}</span>` : ''}</div></div>
  <table><thead><tr><th>Concepto</th><th>Período</th><th class="t">Importe</th></tr></thead><tbody><tr><td>Abono UrbanVoice${x.plan ? ` · plan ${esc(x.plan)}` : ''}${x.socios ? ` · ${nS(x.socios)}` : ''}${x.months > 1 ? ` · ${x.months} meses` : ''}${x.disc ? ` · ${x.disc}% de descuento` : ''}</td><td>${fD(x.from)} al ${fD(x.to)}</td><td class="t">${money(x.amount)}</td></tr></tbody></table>
  <div class="tot"><span>Total recibido</span><b>${money(x.amount)}</b></div>
  <p class="f" style="margin-top:30px">Documento no válido como factura. Gracias por usar UrbanVoice.</p>
  <div class="a"><button onclick="print()">Descargar PDF / Imprimir</button><button onclick="close()">Cerrar</button></div></div></body></html>`);
  w.document.close();
}

export function receiptWa(db: DemoDb, payId: string): string | null {
  const x = db.pays.find((p) => p.id === payId);
  if (!x) return null;
  const c = db.clubs.find((p) => p.id === x.club);
  if (!c) return null;
  return waLink(c.phone, `Hola ${c.owner.split(' ')[0]}! Recibimos el pago del abono de UrbanVoice de ${c.name}: ${money(x.amount)}, período del ${fD(x.from)} al ${fD(x.to)}. Recibo N° ${receiptNumber(x)}. ¡Gracias!`);
}

export function downloadPaysCsv(db: DemoDb, clubId: string): void {
  const c = db.clubs.find((x) => x.id === clubId);
  if (!c) return;
  const rows: Array<Array<string | number>> = [['Fecha', 'Desde', 'Hasta', 'Meses', 'Medio', 'Monto', 'Nota']];
  db.pays
    .filter((p) => p.club === clubId)
    .sort((a, b) => b.date.localeCompare(a.date))
    .forEach((x) => rows.push([fD(x.date), fD(x.from), fD(x.to), x.months, x.method, x.amount, x.note]));
  const csv = `\uFEFF${rows.map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';')).join('\n')}`;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = `pagos-${c.slug}.csv`;
  a.click();
}
