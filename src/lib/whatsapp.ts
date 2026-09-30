import { AppState, monthLabel, orderLines } from '../store';
import * as D from './derive';

const sanitize = (n: string) => n.replace(/\D/g, '');

/* One normaliser for every wa.me link in the app.
   Accepts local (03001234567), national (3001234567) or full international
   (923001234567) — WhatsApp only accepts full international without the +. */
export const DEFAULT_CC = '92';
export function normalizePhone(phone: string, cc: string = DEFAULT_CC): string {
  const n = sanitize(phone);
  if (!n) return '';
  if (n.startsWith('0')) return cc + n.slice(1);        // 0300…  → 92300…
  if (n.length <= 10) return cc + n;                    // 300…   → 92300…
  return n;                                             // already international
}

export function waLink(phone: string, message: string): string {
  const n = normalizePhone(phone);
  return `https://wa.me/${n}?text=${encodeURIComponent(message)}`;
}

/* --- message builders --- */

export function wageMessage(s: AppState, workerId: string, ym: string) {
  const isMaster = workerId === 'master';
  const name = isMaster ? s.settings.masterName : (s.workers.find(w => w.id === workerId)?.name || '');
  const rate = isMaster ? s.settings.masterRate : (s.workers.find(w => w.id === workerId)?.rate || 0);
  const count = isMaster ? D.masterDays(s, ym) : D.workerDays(s, workerId, ym);
  const total = count * rate;
  const paid = D.paidWages(s, workerId, ym);          // month-scoped
  const balance = Math.max(0, total - paid);
  return `Assalam-o-Alaikum ${name},\n\n${monthLabel(ym)} ka hisaab:\n\n` +
    `Days present: ${count}\nRate/day: Rs ${rate}\nTotal: Rs ${total}\n` +
    `Paid: Rs ${paid}\nBalance: Rs ${balance}\n\n` +
    `— ${s.settings.masterName}, The Master's Eye`;
}

export function clientMessage(s: AppState, clientId: string) {
  const c = s.clients.find(x => x.id === clientId);
  if (!c) return '';
  const orders = s.orders.filter(o => o.clientId === clientId);
  const due = D.clientDue(s, c);
  const balanceLine = due >= 0
    ? `Balance due: Rs ${due}`
    : `You have paid Rs ${Math.abs(due)} ahead`;
  return `Assalam-o-Alaikum ${c.name},\n\n` +
    `Your order update:\n` +
    orders.map(o => {
      const lines = orderLines(o);
      const dims = lines.slice(0, 3).map(l => `${l.qty}x ${l.label} ${l.widthIn}"x${l.heightIn}"`).join(', ')
        + (lines.length > 3 ? ` +${lines.length - 3} more` : '');
      return `• ${dims} (${o.woodType}) — ${o.status}`;
    }).join('\n') +
    `\n\nOrder value: Rs ${D.clientTotal(s, c)}\nReceived: Rs ${D.clientPaid(s, c)}\n${balanceLine}\n\n` +
    `— ${s.settings.masterName}, Joinery Mill`;
}

export function vendorMessage(s: AppState, vendorId: string) {
  const v = s.vendors.find(x => x.id === vendorId);
  if (!v) return '';
  const lots = s.woodLots.filter(l => l.vendorId === vendorId);
  const due = D.vendorDue(s, vendorId); // single source: same number as the UI
  const paid = D.vendorPaid(s, vendorId);
  // Total = paid + balance always closes, even after a lot was deleted
  const total = paid + due;
  return `Assalam-o-Alaikum ${v.name},\n\n` +
    lots.map(l => `• ${l.type} ${l.cubicFeet} ft3 — Rs ${D.lotValue(l)}`).join('\n') +
    `\n\nTotal: Rs ${total}\nPaid: Rs ${paid}\nBalance: Rs ${due}\n\n` +
    `— ${s.settings.masterName}`;
}

export function openWhatsApp(phone: string, message: string) {
  window.open(waLink(phone, message), '_blank');
}
